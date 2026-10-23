import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { EmptyState } from '../components/EmptyState'

/**
 * 运行日志（底部面板「日志」页）
 *
 * 自用应用没有 devtools 常开，出问题时先看这里：行情拉取失败、数据库损坏、
 * AI 调用报错都会落到 userData/logs/app-YYYYMMDD.log。
 *
 * 只显示最后 300 行：日志会一直增长，全量拉到渲染进程没有意义还会卡界面。
 */
export function LogPanel() {
  const [content, setContent] = useState('')
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.APP_LOG_TAIL, { lines: 300 })
      setContent(res.content)
      setPath(res.path)
    } catch (err) {
      setContent(`读取日志失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 开着自动刷新时每 5 秒拉一次，方便盯着看实时输出
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, load])

  const openDir = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.APP_LOG_OPEN_DIR, {})
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.toggleLabel}>
          <label className="switch" title="自动刷新日志">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className="switch-track" />
          </label>
          <span>自动刷新（5s）</span>
        </div>
        <button onClick={load} className="btn" disabled={loading}>
          {loading ? '读取中…' : '刷新'}
        </button>
        <button onClick={openDir} className="btn" title={path || '日志目录'}>
          打开日志目录
        </button>
      </div>

      <div style={styles.path}>{path || '日志目录尚未初始化'}</div>

      <div style={styles.body}>
        {content ? (
          content.split('\n').map((line, i) => (
            <div key={i} style={{ ...styles.line, ...(lineColor(line) ?? {}) }}>
              {line}
            </div>
          ))
        ) : (
          <EmptyState
            icon="📄"
            title="暂无日志"
            desc="应用运行日志会写入 userData/logs/app-YYYYMMDD.log，出问题时先看这里。"
          />
        )}
      </div>
    </div>
  )
}

function lineColor(line: string): React.CSSProperties | null {
  if (line.includes('[ERROR]')) return { color: 'var(--red)' }
  if (line.includes('[WARN]')) return { color: 'var(--yellow)' }
  if (line.includes('[DEBUG]')) return { color: 'var(--overlay0)' }
  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: 'var(--bg-base)',
    color: 'var(--text)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--subtext0)',
  },
  path: {
    padding: '4px 12px',
    fontSize: 11,
    color: 'var(--overlay0)',
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '6px 12px',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 11,
    lineHeight: 1.6,
  },
  line: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    color: 'var(--subtext0)',
  },
}
