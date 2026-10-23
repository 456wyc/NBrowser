import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../hooks/useToast'
import {
  IPC_CHANNELS,
  type ResearchReportSummary,
  type ResearchReport,
} from '@shared/ipc'
import { Markdown } from '../components/Markdown'

/**
 * 研究报告库：深度研究代理每次产出报告都会落库，这里做列表 / 查看 / 删除。
 */
export function ResearchReportsPanel() {
  const [reports, setReports] = useState<ResearchReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<ResearchReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')
  const { toast, showToast } = useToast()

  // 列表关键字过滤 + 时间排序（后端只按创建时间倒序返回，这里补齐正序与搜索）
  const visible = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const list = q
      ? reports.filter(
          (r) =>
            r.query.toLowerCase().includes(q) || (r.preview || '').toLowerCase().includes(q)
        )
      : reports
    return [...list].sort((a, b) =>
      sort === 'desc' ? b.created_at - a.created_at : a.created_at - b.created_at
    )
  }, [reports, keyword, sort])

  const load = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_LIST, {})
      setReports(res.reports)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openReport = async (id: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_GET, { id })
      setActive(res.report)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 导出报告为 .md 文件（走主进程保存对话框）
  const handleExport = async (id: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_EXPORT, { id })
      if (res.success && res.path) {
        setExportMsg('已导出 ✓')
      } else {
        setExportMsg('已取消')
      }
    } catch (err) {
      setExportMsg('导出失败')
      console.error('Export failed:', err)
    } finally {
      setTimeout(() => setExportMsg(''), 1500)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这份研究报告吗？删除后无法恢复。')) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_DELETE, { id })
      if (active?.id === id) setActive(null)
      showToast('已删除')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showToast('删除失败：' + msg, false)
    }
  }

  // ---- 详情 ----
  if (active) {
    return (
      <div style={styles.container}>
        <div style={styles.detailHeader}>
          <button onClick={() => setActive(null)} style={styles.backBtn}>
            ‹ 返回
          </button>
          <span style={styles.modeBadge}>{modeLabel(active.mode)}</span>
          <button
            onClick={() => handleExport(active.id)}
            style={styles.exportBtn}
            title="导出为 Markdown 文件"
          >
            {exportMsg || '导出'}
          </button>
          <button
            onClick={() => handleDelete(active.id)}
            className="btn btn-danger"
            style={{ marginLeft: 'auto' }}
          >
            删除
          </button>
        </div>
        <div style={styles.queryLine}>{active.query}</div>
        <div style={styles.timeLine}>{formatTime(active.created_at)}</div>
        <div style={styles.reportBody}>
          <Markdown text={active.report} />
        </div>
      </div>
    )
  }

  // ---- 列表 ----
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>研究报告</span>
        <button onClick={load} className="icon-btn" title="刷新">
          ⟳
        </button>
      </div>

      {reports.length > 0 && (
        <div style={styles.filterRow}>
          <input
            className="field"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="搜索研究主题或内容"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select
            className="field"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'desc' | 'asc')}
            title="按生成时间排序"
          >
            <option value="desc">最新在前</option>
            <option value="asc">最早在前</option>
          </select>
        </div>
      )}

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 8 }}>
          {toast.text}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {loading && <div style={styles.empty}>加载中...</div>}
      {!loading && reports.length === 0 && (
        <div style={styles.empty}>
          <p>还没有研究报告</p>
          <p style={styles.emptyHint}>在「🕸 深度研究」里跑一次研究，报告会自动保存到这里</p>
        </div>
      )}
      {!loading && reports.length > 0 && visible.length === 0 && (
        <div style={styles.empty}>
          <p>没有匹配的研究报告</p>
          <p style={styles.emptyHint}>换个关键字试试</p>
        </div>
      )}

      <div style={styles.list}>
        {visible.map((r) => (
          <div key={r.id} style={styles.item}>
            <div style={styles.itemMain} onClick={() => openReport(r.id)}>
              <div style={styles.itemTop}>
                <span style={styles.modeBadge}>{modeLabel(r.mode)}</span>
                <span style={styles.itemTime}>{formatTime(r.created_at)}</span>
              </div>
              <div style={styles.itemQuery}>{r.query}</div>
              <div style={styles.itemPreview}>{r.preview}</div>
            </div>
            <button
              onClick={() => handleDelete(r.id)}
              style={styles.itemDelete}
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function modeLabel(mode: string): string {
  return mode === 'deepen' ? '深挖当前页' : '自主研究'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '12px 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px 12px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  filterRow: { display: 'flex', gap: 8, padding: '0 16px 10px' },
  list: { flex: 1, overflowY: 'auto' },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
  },
  itemMain: { flex: 1, minWidth: 0, cursor: 'pointer' },
  itemTop: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  modeBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
    flexShrink: 0,
  },
  itemTime: { fontSize: 11, color: 'var(--overlay0)' },
  itemQuery: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemPreview: {
    fontSize: 11,
    color: 'var(--overlay0)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemDelete: {
    border: 'none',
    background: 'transparent',
    color: 'var(--overlay0)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px 10px',
    borderBottom: '1px solid var(--border)',
  },
  backBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--blue)',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
  },
  exportBtn: {
    border: '1px solid var(--border-strong)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--green)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 8px',
  },
  queryLine: {
    padding: '10px 16px 2px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    wordBreak: 'break-word',
  },
  timeLine: { padding: '0 16px 8px', fontSize: 11, color: 'var(--overlay0)' },
  reportBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 16px 16px',
    fontSize: 12,
    lineHeight: 1.7,
    color: 'var(--text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '40px 20px',
    fontSize: 13,
  },
  emptyHint: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  error: {
    margin: '0 12px 8px',
    padding: '6px 10px',
    borderRadius: 4,
    background: 'rgba(var(--red-rgb), 0.12)',
    color: 'var(--red)',
    fontSize: 11,
  },
}
