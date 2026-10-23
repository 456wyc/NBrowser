import { useState, useEffect, useRef, useMemo } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { buildSuggestions, type Suggestion, type SuggestSource } from '@shared/suggest'
import { isNavHomeUrl } from '@shared/url'
import {
  fetchSearchEngineTemplate,
  getSearchEngineTemplateSync,
} from '../hooks/searchEngine'

interface AddressBarProps {
  onAnalyze?: () => void
  analyzing?: boolean
  /**
   * 下拉建议展开时，通知外壳预留出这段高度
   *
   * 网页是独立的 WebContentsView，它盖在 DOM 之上，地址栏的下拉如果照常
   * 绝对定位到网页区，会被网页视图整个遮住。外壳据此在主区顶部让出一条空白，
   * 网页视图随之收缩，下拉就露出来了（见 App 里的 addrOverlay）。
   */
  onSuggestOverlayChange?: (height: number) => void
}

/**
 * 非编辑态的地址栏展示：像 Chrome 一样隐藏 https:// / http:// 前缀，
 * 聚焦编辑时才显示完整地址（见 onFocus）。新标签页（#/nav）不展示。
 */
function displayUrl(url: string): string {
  if (isNavHomeUrl(url)) return ''
  return url.replace(/^https?:\/\//, '')
}

export function AddressBar({ onAnalyze, analyzing, onSuggestOverlayChange }: AddressBarProps) {
  const [url, setUrl] = useState('')
  const [isNav, setIsNav] = useState(false) // 当前标签是新标签页：地址栏整体隐藏，避免与页面内搜索框重复
  const [dirty, setDirty] = useState(false) // 用户是否正在编辑输入框
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [sources, setSources] = useState<SuggestSource>({ bookmarks: [], watchlist: [] })
  const [showSuggest, setShowSuggest] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // 当前标签页（收藏按钮用；不跟随输入框内容，避免用户正在输入时误判）
  const [page, setPage] = useState<{ url: string; title: string } | null>(null)
  const [togglingBookmark, setTogglingBookmark] = useState(false)
  // 缩放控件（像 Chrome：显示当前比例，点击展开 − / % / ＋ / 重置）
  const [zoomPercent, setZoomPercent] = useState(100)
  const [zoomPanelOpen, setZoomPanelOpen] = useState(false)

  const bookmarked = useMemo(
    () => (page ? sources.bookmarks.some((b) => b.url === page.url) : false),
    [page, sources.bookmarks]
  )

  const toggleBookmark = async () => {
    if (!page || !page.url || isNavHomeUrl(page.url)) return
    setTogglingBookmark(true)
    try {
      // 建议源里的书签只有 title/url，删除要 id，所以先取完整列表
      const all = await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_GET_ALL, {})
      const list = all.bookmarks || []
      if (bookmarked) {
        const hit = list.find((b) => b.url === page.url)
        if (hit) {
          await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_DELETE, { id: hit.id })
        }
      } else {
        await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_ADD, {
          title: page.title || page.url,
          url: page.url,
        })
      }
      // 刷新书签源：既更新收藏态，也让地址栏建议跟着变
      const bm = await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_GET_ALL, {})
      setSources((prev) => ({ ...prev, bookmarks: bm.bookmarks || [] }))
    } catch (err) {
      console.error('Failed to toggle bookmark:', err)
    } finally {
      setTogglingBookmark(false)
    }
  }

  const suggestions = useMemo(
    () =>
      dirty && url.trim()
        ? buildSuggestions(url, sources, 8, getSearchEngineTemplateSync())
        : [],
    [dirty, url, sources]
  )
  const openSuggest = suggestions.length > 0

  // 加载活动标签信息
  const loadActiveTab = async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.TABS_GET_ACTIVE, {})
    if (res.tab) setPage({ url: res.tab.url, title: res.tab.title })
    if (res.tab && !dirty) {
      setIsNav(isNavHomeUrl(res.tab.url))
      setUrl(displayUrl(res.tab.url))
    }
  }

  // 加载建议数据源（书签 + 自选股）与搜索引擎模板（预热渲染端缓存）
  useEffect(() => {
    ;(async () => {
      try {
        const [bm, wl] = await Promise.all([
          window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_GET_ALL, {}),
          window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GET_ALL, {}),
        ])
        setSources({ bookmarks: bm.bookmarks || [], watchlist: wl.items || [] })
      } catch {
        // 忽略：建议降级为空
      }
      await fetchSearchEngineTemplate()
    })()
  }, [])

  useEffect(() => {
    loadActiveTab()
  }, [])

  // 标签导航时同步地址栏（用户手动输入过程中不覆盖输入内容）
  useEffect(() => {
    const unsubscribe = window.electronAPI.onTabsUpdated((payload) => {
      const active = payload.tabs.find((t) => t.id === payload.activeTabId) || null
      if (!active) return
      setPage({ url: active.url, title: active.title })
      setIsNav(isNavHomeUrl(active.url))
      if (!dirty) setUrl(displayUrl(active.url))
    })
    return unsubscribe
  }, [dirty])

  // 下拉展开时把实际高度报给外壳，让它让出位置（否则会被网页视图盖住）
  // 注意：缩放控件在顶栏内联展开，不向下弹层，因此不需要让位
  const dropdownOpen = openSuggest && showSuggest
  useEffect(() => {
    if (!dropdownOpen || !onSuggestOverlayChange) {
      onSuggestOverlayChange?.(0)
      return
    }
    const el = dropdownRef.current
    onSuggestOverlayChange(el ? Math.ceil(el.getBoundingClientRect().height) + 8 : 0)
  }, [dropdownOpen, suggestions.length, onSuggestOverlayChange])

  // 主进程推送缩放变化（快捷键 / 站点恢复 / 控件操作）
  useEffect(() => {
    const unsubscribe = window.electronAPI.onZoomChanged(({ percent }) => setZoomPercent(percent))
    return unsubscribe
  }, [])

  const zoomAction = async (action: 'in' | 'out' | 'reset') => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.APP_ZOOM, { action })
      if (res.percent != null) setZoomPercent(res.percent)
      if (action === 'reset') setZoomPanelOpen(false)
    } catch (err) {
      console.error('Zoom failed:', err)
    }
  }

  // Ctrl/Cmd+L：聚焦并全选地址栏；新标签页没有地址栏，转发给首页大搜索框
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFocusAddress(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
        return
      }
      window.dispatchEvent(new Event('navhome:focus-search'))
    })
    return unsubscribe
  }, [])

  const navigateTo = (target: string) => {
    setUrl(target)
    setDirty(false)
    setShowSuggest(false)
    window.electronAPI.invoke(IPC_CHANNELS.TABS_NAVIGATE, { url: target })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (openSuggest) {
      navigateTo(suggestions[0].url)
      return
    }
    navigateTo(url)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (openSuggest) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        navigateTo(suggestions[highlight]?.url ?? suggestions[0].url)
        return
      }
      if (e.key === 'Escape') {
        setShowSuggest(false)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      navigateTo(url)
    }
  }

  // 新标签页：输入由导航首页的大搜索框承担，这里整体隐藏（含 AI 按钮），不留重复输入框
  if (isNav) return null

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputWrap}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setDirty(true)
              setShowSuggest(true)
              setHighlight(0)
            }}
            onFocus={() => {
              setDirty(true)
              // 编辑态显示完整地址（含协议），方便复制/修改
              const full = page?.url ?? ''
              if (full && !isNavHomeUrl(full)) setUrl(full)
              if (suggestions.length > 0) setShowSuggest(true)
            }}
            onBlur={() => {
              setDirty(false)
              setShowSuggest(false)
              // 失焦恢复展示格式（隐藏协议前缀，显示当前页面地址）
              setUrl(displayUrl(page?.url ?? ''))
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入网址或搜索词"
            className="field"
          />
          {dropdownOpen && (
            <div ref={dropdownRef} style={styles.dropdown}>
              {suggestions.map((s, i) => (
                <div
                  key={`${s.kind}-${s.url}-${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    navigateTo(s.url)
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    ...styles.option,
                    ...(i === highlight ? styles.optionActive : {}),
                  }}
                >
                  <span style={styles.optionKind}>{kindLabel(s.kind)}</span>
                  <span style={styles.optionTitle}>{s.title}</span>
                  <span style={styles.optionSub}>{s.subtitle}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
      <div style={styles.zoomWrap}>
          {zoomPanelOpen ? (
            <>
              <button onClick={() => zoomAction('out')} className="btn" style={styles.zoomBtn} title="缩小">
                −
              </button>
              <span style={styles.zoomVal}>{zoomPercent}%</span>
              <button onClick={() => zoomAction('in')} className="btn" style={styles.zoomBtn} title="放大">
                ＋
              </button>
              <button onClick={() => zoomAction('reset')} className="btn" style={styles.zoomBtn} title="恢复 100%">
                重置
              </button>
              <button
                onClick={() => setZoomPanelOpen(false)}
                className="icon-btn bordered"
                title="收起"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setZoomPanelOpen(true)}
              className={'icon-btn bordered' + (zoomPercent !== 100 ? ' yellow' : '')}
              title="页面缩放"
              style={zoomPercent !== 100 ? styles.zoomBtnActive : undefined}
            >
              {zoomPercent !== 100 ? (
                `${zoomPercent}%`
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <line x1="15.5" y1="15.5" x2="21" y2="21" />
                  <line x1="10.5" y1="8" x2="10.5" y2="13" />
                  <line x1="8" y1="10.5" x2="13" y2="10.5" />
                </svg>
              )}
            </button>
          )}
      </div>
      {page && !isNavHomeUrl(page.url) && (
        <button
          onClick={toggleBookmark}
          disabled={togglingBookmark}
          className={'icon-btn bordered' + (bookmarked ? ' yellow' : '')}
          title={bookmarked ? '已收藏，点击取消' : '收藏当前页面'}
        >
          {bookmarked ? '★' : '☆'}
        </button>
      )}
      {onAnalyze && (
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="icon-btn bordered yellow"
          title="用 AI 整理当前页面"
        >
          {analyzing ? '…' : '✨'}
        </button>
      )}
    </div>
  )
}

function kindLabel(kind: Suggestion['kind']): string {
  switch (kind) {
    case 'bookmark':
      return '书签'
    case 'watch':
      return '自选'
    case 'url':
      return '打开'
    case 'search':
      return '搜索'
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    // 嵌在顶栏行内：高度/背景由顶栏统一承担，这里只负责横向填充
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  form: {
    flex: 1,
  },
  inputWrap: {
    position: 'relative',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    zIndex: 50,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    maxHeight: 280,
    overflowY: 'auto',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: 12.5,
    color: 'var(--text)',
  },
  optionActive: {
    background: 'rgba(var(--blue-rgb), 0.18)',
  },
  optionKind: {
    flexShrink: 0,
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'var(--surface0)',
    color: 'var(--subtext0)',
  },
  optionTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionSub: {
    flexShrink: 0,
    fontSize: 10.5,
    color: 'var(--overlay0)',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  zoomWrap: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  zoomBtnActive: { minWidth: 44, fontSize: 11 },
  zoomBtn: { padding: '2px 8px', fontSize: 12, minWidth: 28 },
  zoomVal: { fontSize: 12, color: 'var(--text)', minWidth: 38, textAlign: 'center' },
}
