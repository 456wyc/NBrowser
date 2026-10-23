import { useState, useEffect, useMemo } from 'react'
import {
  IPC_CHANNELS,
  type StockVisitSummary,
  type PageVisit,
} from '@shared/ipc'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { useToast } from '../hooks/useToast'
import { useSpaces } from '../hooks/useSpaces'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toTimestamp(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime()
}

/**
 * 浏览轨迹
 *
 * 全屏模式（导航首页里的页签）和紧凑模式（底部面板）共用一套逻辑，
 * 只是间距与标题不同：底部面板只有两三百像素高，再用 32px 的大留白就看不到内容了。
 */
export function TodayVisitsPage({ compact = false }: { compact?: boolean }) {
  // 组件内 shadow 掉模块级样式：JSX 里照常写 styles.xxx，两种模式自动切换
  const styles = compact ? { ...baseStyles, ...compactStyles } : baseStyles
  const [summaries, setSummaries] = useState<StockVisitSummary[]>([])
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const [visits, setVisits] = useState<PageVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [selectedSpace, setSelectedSpace] = useState('')
  const [exporting, setExporting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const { spaces } = useSpaces()

  // 空间下拉：全部空间 + 当前所有空间；若已选中的空间已被删除，仍保留它以免选项丢失
  const spaceOptions = useMemo(() => {
    const list = [{ value: '', label: '全部空间' }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]
    if (selectedSpace && !list.some((o) => o.value === selectedSpace)) {
      list.push({ value: selectedSpace, label: selectedSpace })
    }
    return list
  }, [spaces, selectedSpace])

  // 加载（按日期 + 空间过滤）汇总
  const loadSummary = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PAGE_VISITS_GET_SUMMARY, {
        date: toTimestamp(selectedDate),
        space: selectedSpace || undefined,
      })
      setSummaries(res.summaries)
      setLoadError(null)
    } catch (err) {
      console.error('Failed to load visit summary:', err)
      setSummaries([])
      setLoadError(err instanceof Error ? err.message : '读取浏览轨迹失败')
    } finally {
      setLoading(false)
    }
  }

  // 加载跟踪开关状态
  const loadTrackingEnabled = async () => {
    try {
      const res = await window.electronAPI.invoke(
        IPC_CHANNELS.SETTINGS_GET_TRACKING_ENABLED,
        {}
      )
      setTrackingEnabled(res.enabled)
    } catch (err) {
      console.error('Failed to load tracking setting:', err)
    }
  }

  useEffect(() => {
    loadTrackingEnabled()
  }, [])

  useEffect(() => {
    loadSummary()
  }, [selectedDate, selectedSpace])

  // 展开某只股票的详情
  const handleExpand = async (symbol: string) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null)
      return
    }
    setExpandedSymbol(symbol)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PAGE_VISITS_GET_BY_STOCK, {
        symbol,
        date: toTimestamp(selectedDate),
        space: selectedSpace || undefined,
      })
      setVisits(res.visits)
    } catch (err) {
      console.error('Failed to load visits:', err)
      setVisits([])
    }
  }

  // 删除单条访问记录（此前只能「清除全部」）
  const handleDeleteVisit = async (id: number) => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.PAGE_VISITS_DELETE, { id })
      setVisits((prev) => prev.filter((v) => v.id !== id))
      showToast('已删除该条记录')
      await loadSummary()
    } catch (err) {
      console.error('Failed to delete visit:', err)
      showToast('删除失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  // 切换跟踪开关
  const handleToggleTracking = async () => {
    const newVal = !trackingEnabled
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_TRACKING_ENABLED, {
        enabled: newVal,
      })
      setTrackingEnabled(newVal)
    } catch (err) {
      console.error('Failed to toggle tracking:', err)
    }
  }

  // 清除所有轨迹
  const handleClearAll = async () => {
    if (!confirm('确定要清除所有浏览轨迹吗？此操作不可恢复。')) return
    setClearing(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.PAGE_VISITS_CLEAR_ALL, {})
      setSummaries([])
      setVisits([])
      setExpandedSymbol(null)
    } catch (err) {
      console.error('Failed to clear visits:', err)
    } finally {
      setClearing(false)
    }
  }

  // 导出当前筛选范围
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PAGE_VISITS_EXPORT, {
        date: toTimestamp(selectedDate),
        space: selectedSpace || undefined,
      })
      if (!res.success) {
        showToast(res.count === 0 ? '所选范围暂无浏览记录，无法导出' : '已取消导出', false)
      } else {
        showToast(`已导出 ${res.count} 条记录${res.path ? `：${res.path}` : ''}`)
      }
    } catch (err) {
      console.error('Failed to export visits:', err)
      showToast('导出失败：' + (err instanceof Error ? err.message : String(err)), false)
    } finally {
      setExporting(false)
    }
  }

  // 格式化时长
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (minutes < 60) return `${minutes}分${secs}秒`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}小时${mins}分`
  }

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 简化 URL 显示
  const formatUrl = (url: string): string => {
    try {
      const u = new URL(url)
      return u.hostname + u.pathname.slice(0, 30)
    } catch {
      return url.slice(0, 50)
    }
  }

  // 全屏与紧凑两处都需要「记录轨迹」开关，抽成同一份 JSX 避免样式/文案漂移
  const trackingToggle = (
    <div style={styles.toggleLabel}>
      <label className="switch" title={trackingEnabled ? '点击关闭记录' : '点击开启记录'}>
        <input type="checkbox" checked={trackingEnabled} onChange={handleToggleTracking} />
        <span className="switch-track" />
      </label>
      <span>记录轨迹</span>
    </div>
  )

  return (
    <div style={styles.container}>
      {/* 标题并入过滤行：所在页签（导航页「今日浏览」/底部面板 Tab）已标明内容，
          大标题单独占一行既重复又让开关与过滤控件不在一条线上 */}

      {!trackingEnabled && (
        <div style={styles.disabledBanner}>
          轨迹记录已关闭，当前不会记录浏览行为
        </div>
      )}

      <div style={styles.filters}>
        {!compact && <span style={styles.inlineTitle}>浏览轨迹</span>}
        {trackingToggle}
        <button onClick={handleClearAll} disabled={clearing} className="btn-danger">
          清除全部
        </button>
        <div style={styles.filterSpacer} />
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>日期</label>
          <input
            type="date"
            className="field"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>空间</label>
          <select
            className="field"
            value={selectedSpace}
            onChange={(e) => setSelectedSpace(e.target.value)}
          >
            {spaceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn"
        >
          {exporting ? '导出中...' : '导出 CSV'}
        </button>
      </div>

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 8 }}>
          {toast.text}
        </div>
      )}

      <div style={styles.content}>
        {loading ? (
          <div style={styles.loading}>加载中...</div>
        ) : loadError ? (
          <ErrorState title="浏览轨迹加载失败" desc={loadError} onRetry={loadSummary} />
        ) : summaries.length === 0 ? (
          <EmptyState
            icon="🕐"
            title="该范围暂无浏览记录"
            desc="切换日期或空间，或浏览股票相关页面后再来查看。"
          />
        ) : (
          <div style={styles.list}>
            {summaries.map((summary) => (
              <div key={summary.symbol} style={styles.stockItem}>
                <div
                  onClick={() => handleExpand(summary.symbol)}
                  style={styles.stockHeader}
                >
                  <div style={styles.stockInfo}>
                    <span style={styles.stockName}>
                      {summary.name || summary.symbol}
                    </span>
                    <span style={styles.stockCode}>{summary.symbol}</span>
                  </div>
                  <div style={styles.stockStats}>
                    <span style={styles.visitCount}>
                      {summary.visit_count} 次访问
                    </span>
                    <span style={styles.totalDuration}>
                      共 {formatDuration(summary.total_duration_ms)}
                    </span>
                    <span style={styles.expandIcon}>
                      {expandedSymbol === summary.symbol ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {expandedSymbol === summary.symbol && (
                  <div style={styles.visitList}>
                    {visits.length === 0 ? (
                      <div style={styles.noVisits}>暂无详情</div>
                    ) : (
                      visits.map((visit) => (
                        <div key={visit.id} style={styles.visitItem}>
                          <div style={styles.visitTime}>
                            {formatTime(visit.started_at)}
                          </div>
                          <div style={styles.visitInfo}>
                            <div style={styles.visitTitle}>
                              {visit.title || formatUrl(visit.url)}
                            </div>
                            <div style={styles.visitUrl}>{formatUrl(visit.url)}</div>
                          </div>
                          <div style={styles.visitDuration}>
                            {formatDuration(visit.duration_ms)}
                          </div>
                          <button
                            onClick={() => handleDeleteVisit(visit.id)}
                            className="icon-btn danger"
                            title="删除这条记录"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const baseStyles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    color: 'var(--text)',
  },
  inlineTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    flexShrink: 0,
  },
  filterSpacer: { flex: 1 },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--subtext0)',
    cursor: 'pointer',
  },
  disabledBanner: {
    padding: '12px 32px',
    background: 'rgba(var(--yellow-rgb), 0.1)',
    color: 'var(--yellow)',
    fontSize: 13,
    flexShrink: 0,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 32px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  // 「日期/空间」标签放在控件左侧并垂直居中（与紧凑模式统一），
  // column 布局的标签会悬在上一行，和标题/开关/按钮不在一条线上
  filterGroup: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 11,
    color: 'var(--overlay0)',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 32px',
  },
  loading: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '60px 0',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '80px 0',
    fontSize: 15,
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 8,
    opacity: 0.7,
  },
  list: {
    maxWidth: 800,
    margin: '0 auto',
  },
  stockItem: {
    background: 'var(--surface0)',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    cursor: 'pointer',
  },
  stockInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  stockName: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
  },
  stockCode: {
    fontSize: 12,
    color: 'var(--overlay0)',
  },
  stockStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontSize: 13,
  },
  visitCount: {
    color: 'var(--subtext0)',
  },
  totalDuration: {
    color: 'var(--blue)',
    fontWeight: 500,
  },
  expandIcon: {
    color: 'var(--overlay0)',
    fontSize: 12,
    width: 20,
    textAlign: 'center',
  },
  visitList: {
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-mantle)',
  },
  visitItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    gap: 16,
    borderBottom: '1px solid var(--border)',
  },
  visitTime: {
    fontSize: 12,
    color: 'var(--overlay0)',
    width: 50,
    flexShrink: 0,
  },
  visitInfo: {
    flex: 1,
    minWidth: 0,
  },
  visitTitle: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  visitUrl: {
    fontSize: 11,
    color: 'var(--overlay0)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  visitDuration: {
    fontSize: 12,
    color: 'var(--subtext0)',
    flexShrink: 0,
  },
  noVisits: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--overlay0)',
    fontSize: 13,
  },
}

/** 底部面板用的紧凑覆盖：去掉大标题与大幅留白，两三百像素高也能看内容 */
const compactStyles: Record<string, React.CSSProperties> = {
  disabledBanner: {
    padding: '6px 12px',
    background: 'rgba(var(--yellow-rgb), 0.1)',
    color: 'var(--yellow)',
    fontSize: 12,
    flexShrink: 0,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  // filterGroup/filterLabel 已并入 baseStyles（两模式统一的横向标签布局）
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '24px 0',
    fontSize: 13,
  },
  list: { maxWidth: 'none' },
  stockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
  },
  stockName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  visitItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    gap: 12,
    borderBottom: '1px solid var(--border)',
  },
}
