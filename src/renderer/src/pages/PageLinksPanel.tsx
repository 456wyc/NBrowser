import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS, type WebLink } from '@shared/ipc'

export function PageLinksPanel() {
  const [links, setLinks] = useState<WebLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.WEB_GET_LINKS, {})
      setLinks(res.links)
    } catch (err) {
      setError(err instanceof Error ? err.message : '采集失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 打开链接：后台标签（保持当前页），右键/按钮可前台打开
  const open = async (href: string, background = true) => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_CREATE, { url: href, active: !background })
  }

  const stockCount = links.filter((l) => l.isStock).length

  return (
    <div style={styles.container}>
      <div style={styles.head}>
        <span style={styles.count}>
          共 {links.length} 条链接{stockCount > 0 ? ` · ${stockCount} 个股票` : ''}
        </span>
        <button onClick={load} className="icon-btn" title="重新采集">
          ↻
        </button>
      </div>

      {loading && <div style={styles.state}>采集当前页面链接中…</div>}
      {!loading && error && <div style={styles.error}>{error}</div>}
      {!loading && !error && links.length === 0 && (
        <div style={styles.state}>当前页面没有可采集的链接</div>
      )}

      <div style={styles.list}>
        {links.map((l, i) => (
          <div key={`${l.href}-${i}`} style={styles.item}>
            <div style={styles.itemMain} onClick={() => open(l.href, true)}>
              <span style={styles.itemText} title={l.text}>
                {l.text}
              </span>
              {l.isStock && <span style={styles.stockBadge}>{l.symbol}</span>}
            </div>
            <div style={styles.itemBottom}>
              <span style={styles.itemHref} title={l.href}>
                {l.href}
              </span>
              <button
                style={styles.openBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  open(l.href, false)
                }}
                title="前台打开"
              >
                前台
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  count: { fontSize: 12, color: 'var(--subtext0)' },
  state: { padding: '40px 16px', textAlign: 'center', color: 'var(--overlay0)', fontSize: 13 },
  error: { padding: '16px', color: 'var(--red)', fontSize: 12, lineHeight: 1.6 },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  item: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
  },
  itemMain: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  itemText: {
    flex: 1,
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stockBadge: {
    flexShrink: 0,
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 3,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
  },
  itemBottom: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 },
  itemHref: {
    flex: 1,
    fontSize: 11,
    color: 'var(--overlay0)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  openBtn: {
    flexShrink: 0,
    padding: '2px 8px',
    border: '1px solid var(--border-strong)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'color 0.15s, border-color 0.15s',
  },
}
