import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS, type TradesGetContextResponse } from '@shared/ipc'
import { formatDuration, formatContextTime } from '@shared/review-context'

/**
 * 复盘闭环：这笔交易「当时的决策依据」
 *
 * 成交前 N 天、同一股票的浏览轨迹与 AI 分析记录——回答「我当初为什么买」。
 * 数据来自 page_visits / ai_analyses 两张表（主进程 trades:getContext 关联查询），
 * 记录存在才显示，不存在时给出说明而不是空白。
 */

const WINDOW_OPTIONS: Array<{ hours: number; label: string }> = [
  { hours: 24, label: '前 1 天' },
  { hours: 72, label: '前 3 天' },
  { hours: 168, label: '前 7 天' },
  { hours: 720, label: '前 30 天' },
]

const PAGE_TYPE_LABEL: Record<string, string> = {
  announcement: '公告',
  news: '新闻',
  financial_report: '财报',
  community: '社区',
  general: '页面',
}

export function DecisionContext({
  symbol,
  tradedAt,
  side,
}: {
  symbol: string
  tradedAt: number
  side: 'buy' | 'sell'
}) {
  const [ctx, setCtx] = useState<TradesGetContextResponse | null>(null)
  const [hours, setHours] = useState(72)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 已加载过的窗口不重复请求（切换窗口才拉）
  const loadedHoursRef = useRef<number | null>(null)
  const [openAnalysisId, setOpenAnalysisId] = useState<number | null>(null)

  const load = async (h: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.TRADES_GET_CONTEXT, {
        symbol,
        tradedAt,
        hours: h,
      })
      setCtx(res)
      loadedHoursRef.current = h
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // 首次展开即加载默认窗口
  useEffect(() => {
    if (loadedHoursRef.current === null) void load(hours)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openUrl = (url: string) => {
    void window.electronAPI.invoke(IPC_CHANNELS.TABS_CREATE, { url, active: true })
  }

  const total = ctx ? ctx.visits.length + ctx.analyses.length : 0

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <span style={styles.title}>🧭 当时的决策依据</span>
        <span style={styles.subtitle}>
          {side === 'buy' ? '买入' : '卖出'}前的研究记录（轨迹 + AI 分析）
        </span>
        <div style={{ flex: 1 }} />
        <select
          className="field"
          style={styles.sel}
          value={hours}
          onChange={(e) => {
            const h = Number(e.target.value)
            setHours(h)
            void load(h)
          }}
          title="回溯窗口"
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.hours} value={o.hours}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <div style={styles.state}>正在查找当时的研究记录…</div>}
      {error && (
        <div style={styles.error}>
          加载失败：{error}
          <button className="btn" style={styles.retryBtn} onClick={() => void load(hours)}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && ctx && (
        <>
          {total === 0 ? (
            <div style={styles.empty}>
              这段时间没有找到 {symbol} 的相关记录。
              <div style={styles.emptyHint}>
                浏览轨迹需要当时在牛Browser 里看过该股票；用其他设备或其他浏览器研究的内容不会出现在这里。
              </div>
            </div>
          ) : (
            <>
              <div style={styles.statLine}>
                共 {ctx.visits.length} 次浏览 · {ctx.analyses.length} 次 AI 分析 · 累计研究{' '}
                {formatDuration(ctx.totalResearchMs)}
              </div>

              {ctx.visits.map((v) => (
                <div
                  key={`v-${v.id}`}
                  style={styles.row}
                  onClick={() => openUrl(v.url)}
                  title="点击打开原页面"
                >
                  <span style={styles.rowTime}>{formatContextTime(v.started_at)}</span>
                  <span style={styles.rowTitle}>{v.title || v.url}</span>
                  <span style={styles.rowMeta}>
                    {formatDuration(v.duration_ms)} · {v.space}
                  </span>
                </div>
              ))}

              {ctx.analyses.map((a) => (
                <div
                  key={`a-${a.id}`}
                  style={styles.row}
                  onClick={() => setOpenAnalysisId(openAnalysisId === a.id ? null : a.id)}
                  title="点击展开/收起摘要"
                >
                  <span style={styles.rowTime}>{formatContextTime(a.created_at)}</span>
                  <span style={styles.rowTitle}>
                    <span style={styles.analysisBadge}>AI</span>
                    {PAGE_TYPE_LABEL[a.page_type] ?? a.page_type} · {a.summary || '（无摘要）'}
                  </span>
                  <span style={styles.rowMeta}>{openAnalysisId === a.id ? '▲' : '▼'}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 10,
    background: 'var(--bg-mantle)',
  },
  head: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
  subtitle: { fontSize: 11, color: 'var(--overlay0)' },
  sel: { fontSize: 11, padding: '2px 6px', width: 'auto' },
  state: { fontSize: 11.5, color: 'var(--overlay0)', padding: '8px 0' },
  error: {
    fontSize: 11.5,
    color: 'var(--red)',
    padding: '8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  retryBtn: { fontSize: 11, padding: '2px 8px' },
  empty: { fontSize: 11.5, color: 'var(--subtext0)', padding: '6px 0', lineHeight: 1.6 },
  emptyHint: { fontSize: 11, color: 'var(--overlay0)', marginTop: 4, lineHeight: 1.6 },
  statLine: { fontSize: 11, color: 'var(--blue)', padding: '6px 0' },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '4px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11.5,
  },
  rowTime: { color: 'var(--overlay0)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  rowTitle: {
    color: 'var(--text)',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: { color: 'var(--overlay0)', flexShrink: 0, fontSize: 10.5 },
  analysisBadge: {
    display: 'inline-block',
    fontSize: 9,
    padding: '0 4px',
    marginRight: 4,
    borderRadius: 3,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
    verticalAlign: 'middle',
  },
}
