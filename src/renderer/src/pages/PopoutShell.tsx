import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IPC_CHANNELS, type PopoutTabInfo } from '@shared/ipc'
import { parsePopoutHash } from '@shared/popout-layout'
import { useThemeMode } from '../lib/themeMode'

/**
 * 独立窗口外壳（#/popout?win=<windowId>）
 *
 * 一个真正的浏览器窗口：窗口自带标签栏（可开多页）+ 一条工具栏（后退/前进/刷新/地址栏/收回），
 * 下面是网页区占位——真正的网页由主进程把标签的 WebContentsView 挂到这个窗口上渲染。
 *
 * 多屏时每一块屏幕放一个窗口、各自开着不同的页面；关掉窗口，窗口内所有标签一起回到主窗口标签栏。
 */
export function PopoutShell() {
  const windowId = useMemo(() => parsePopoutHash(location.hash), [])
  const [tabs, setTabs] = useState<PopoutTabInfo[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 跟随主窗口主题（非权威实例：只跟随，不写入）
  useThemeMode()

  const webAreaRef = useRef<HTMLDivElement | null>(null)
  const addrRef = useRef<HTMLInputElement | null>(null)
  const lastKeyRef = useRef('')

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0]
  const activeId = activeTab?.tabId ?? ''

  // 网页区矩形上报：主进程按这个矩形摆放网页视图（与主窗口同一套路：渲染进程实测，主进程照搬）
  const push = useCallback(() => {
    const el = webAreaRef.current
    if (!el || !windowId) return
    const r = el.getBoundingClientRect()
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    window.electronAPI
      .invoke(IPC_CHANNELS.WINDOWS_SET_BOUNDS, {
        windowId,
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      })
      .catch(() => {
        /* 上报失败不影响界面，下次尺寸变化会重试 */
      })
  }, [windowId])

  useEffect(() => {
    const el = webAreaRef.current
    if (!el) return
    let frame = 0
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          push()
        })
      }
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [push])

  // 窗口内标签：初次拉取 + 订阅推送
  useEffect(() => {
    if (!windowId) return
    let mounted = true
    window.electronAPI
      .invoke(IPC_CHANNELS.WINDOWS_GET_TABS, { windowId })
      .then((res) => {
        if (!mounted) return
        setTabs(res.tabs)
        setActiveTabId(res.activeTabId)
        setDraft(res.tabs.find((t) => t.tabId === res.activeTabId)?.url ?? '')
      })
      .catch(() => setError('读取窗口标签失败'))

    const off = window.electronAPI.onPopoutTabsUpdated((payload) => {
      if (payload.windowId !== windowId) return
      setTabs(payload.tabs)
      setActiveTabId(payload.activeTabId)
      // 用户正在编辑地址时不打断输入
      setDraft((cur) =>
        document.activeElement === addrRef.current ? cur : payload.tabs.find((t) => t.isActive)?.url ?? ''
      )
    })
    return () => {
      mounted = false
      off()
    }
  }, [windowId])

  const navigate = async (url: string) => {
    if (!activeId || !url.trim()) return
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_NAVIGATE, { tabId: activeId, url: url.trim() })
  }

  const back = () => activeId && window.electronAPI.invoke(IPC_CHANNELS.TABS_GO_BACK, { tabId: activeId })
  const forward = () => activeId && window.electronAPI.invoke(IPC_CHANNELS.TABS_GO_FORWARD, { tabId: activeId })
  const reload = () => activeId && window.electronAPI.invoke(IPC_CHANNELS.TABS_RELOAD, { tabId: activeId })
  const switchTab = (tabId: string) =>
    window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_SWITCH_TAB, { tabId })
  const newTab = () => windowId && window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_NEW_TAB, { windowId })
  const closeTab = (tabId: string) =>
    window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_CLOSE_TAB, { tabId })
  // 单页拖回：这一页回到主窗口标签栏并成为活动标签，窗口保留其余页
  const returnTab = (tabId: string) =>
    window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_RETURN_TAB, { tabId })
  // 收回：关掉这个窗口，窗口里所有标签一起回到主窗口标签栏
  const returnToMain = () => {
    if (activeId) return window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_CLOSE, { tabId: activeId })
    return Promise.resolve()
  }

  if (!windowId) {
    return (
      <div style={styles.wrap}>
        <div style={styles.box}>
          <div style={styles.title}>独立窗口缺少参数</div>
          <div style={styles.desc}>地址里没有 win 参数，请从主窗口标签右键「弹出为独立窗口」打开。</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      {/* 窗口自带标签栏：一窗多页，各页可独立关闭 */}
      <div style={styles.tabStrip}>
        {tabs.map((tab) => (
          <div
            key={tab.tabId}
            style={{
              ...styles.tab,
              ...(tab.tabId === activeTabId ? styles.tabActive : {}),
            }}
            onClick={() => void switchTab(tab.tabId)}
            title={tab.title || tab.url}
          >
            <span style={styles.tabTitle}>{truncate(tab.title || tab.url, 16)}</span>
            <button
              className="icon-btn"
              style={styles.tabAction}
              title="这一页回到主窗口标签栏（窗口保留其余页）"
              onClick={(e) => {
                e.stopPropagation()
                void returnTab(tab.tabId)
              }}
            >
              ⇱
            </button>
            <button
              className="icon-btn"
              style={styles.tabClose}
              title="关闭这一页"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(tab.tabId)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="icon-btn" style={styles.newTab} title="在这个窗口里新开一页" onClick={() => void newTab()}>
          +
        </button>
        <div style={styles.tabSpacer} />
        <button className="btn" style={styles.returnBtn} title="关掉这个窗口，窗口里所有标签回到主窗口" onClick={() => void returnToMain()}>
          🪟 回到标签栏
        </button>
      </div>

      {/* 工具栏 */}
      <div style={styles.bar}>
        <button className="icon-btn" title="后退" onClick={() => void back()}>
          ←
        </button>
        <button className="icon-btn" title="前进" onClick={() => void forward()}>
          →
        </button>
        <button className="icon-btn" title="刷新" onClick={() => void reload()}>
          ↻
        </button>
        <input
          ref={addrRef}
          className="field"
          style={styles.addr}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void navigate(draft)
            if (e.key === 'Escape') setDraft(activeTab?.url ?? '')
          }}
          placeholder="输入网址或搜索词，回车打开"
          spellCheck={false}
        />
      </div>

      {/* 网页区占位：真实网页由主进程挂在这个窗口上，任何样式变化都会改变网页位置 */}
      <div ref={webAreaRef} style={styles.webArea} />
      {error && <div style={styles.error}>{error}</div>}
    </div>
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    color: 'var(--text)',
  },
  tabStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    background: 'var(--bg-mantle)',
    borderBottom: '1px solid var(--border)',
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    maxWidth: 180,
    padding: '3px 6px',
    fontSize: 11.5,
    borderRadius: 4,
    color: 'var(--subtext0)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  tabActive: { background: 'var(--bg-surface0)', color: 'var(--text)' },
  tabTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tabAction: { fontSize: 11, padding: '0 2px', opacity: 0.6 },
  tabClose: { fontSize: 12, padding: '0 2px', opacity: 0.7 },
  newTab: { flexShrink: 0, fontSize: 12 },
  tabSpacer: { flex: 1, minWidth: 8 },
  returnBtn: { fontSize: 11.5, whiteSpace: 'nowrap', flexShrink: 0 },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 8px',
    background: 'var(--bg-mantle)',
    borderBottom: '1px solid var(--border)',
  },
  addr: { flex: 1, minWidth: 0, fontSize: 12 },
  webArea: { flex: 1, minHeight: 0, background: 'var(--bg-base)' },
  box: { maxWidth: 520, padding: 20 },
  title: { fontSize: 15, fontWeight: 600, marginBottom: 8 },
  desc: { fontSize: 12.5, lineHeight: 1.8, color: 'var(--subtext0)' },
  error: { position: 'fixed', left: 8, bottom: 8, fontSize: 11.5, color: 'var(--red)' },
}
