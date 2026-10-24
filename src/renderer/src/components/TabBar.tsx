import { useEffect, useState } from 'react'
import { IPC_CHANNELS, type PopoutWindowInfo, type Tab } from '@shared/ipc'
import { useTabs } from '../hooks/useTabs'

export function TabBar() {
  const { tabs, activeTabId } = useTabs()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // 已弹出的标签不属于主窗口：只在对应的独立窗口里显示，主窗口标签栏只列自己的标签，
  // 否则「在弹窗里新建/打开的页」会同时出现在主窗口标签栏，看起来像开到了主窗口。
  // （独立窗口仍可通过 🪟 N 角标统一收回主窗口）
  const visibleTabs = tabs.filter((t) => !t.poppedOut)
  // 已弹出的独立窗口（多屏时每块屏幕可以放一个）
  const [popouts, setPopouts] = useState<PopoutWindowInfo[]>([])

  useEffect(() => {
    window.electronAPI
      .invoke(IPC_CHANNELS.WINDOWS_GET_ALL, {})
      .then((res) => setPopouts(res.windows))
      .catch(() => {
        /* 读不到就不显示角标，不影响标签栏 */
      })
    const off = window.electronAPI.onPopoutWindowsUpdated((payload) => setPopouts(payload.windows))
    return off
  }, [])

  const handleCloseAllPopouts = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_CLOSE_ALL, {})
  }

  const handleNewTab = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_CREATE, { active: true })
  }

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_CLOSE, { tabId })
  }

  // 已弹出的标签不在主窗口里渲染：点它是唤醒那个独立窗口
  const handleSwitchTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.poppedOut) {
      await window.electronAPI.invoke(IPC_CHANNELS.WINDOWS_FOCUS, { tabId })
      return
    }
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_SWITCH, { tabId })
  }

  // 中键关闭标签
  const handleAuxClick = async (e: React.MouseEvent, tabId: string) => {
    if (e.button !== 1) return
    e.preventDefault()
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_CLOSE, { tabId })
  }

  // 右键菜单（菜单由主进程构建并弹出）
  const handleContextMenu = async (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_SHOW_CONTEXT_MENU, { tabId })
  }

  const handleReload = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_RELOAD, {})
  }

  const handleBack = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_GO_BACK, {})
  }

  const handleForward = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_GO_FORWARD, {})
  }

  // 拖拽排序
  const handleDragEnd = async () => {
    setDragId(null)
    setOverId(null)
  }

  const handleDrop = async (targetId: string) => {
    const sourceId = dragId
    setDragId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return

    const from = visibleTabs.findIndex((t) => t.id === sourceId)
    const to = visibleTabs.findIndex((t) => t.id === targetId)
    if (from < 0 || to < 0) return

    const next = visibleTabs.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    await window.electronAPI.invoke(IPC_CHANNELS.TABS_REORDER, {
      ids: next.map((t) => t.id),
    })
  }

  const activeTab: Tab | undefined = tabs.find((t) => t.id === activeTabId)

  return (
    <div style={styles.container} className="drag-region">
      {/* 导航按钮 */}
      <div style={styles.navButtons} className="no-drag">
        <button
          onClick={handleBack}
          disabled={!activeTab?.canGoBack}
          className="icon-btn"
          title="后退 (Alt+←)"
        >
          ←
        </button>
        <button
          onClick={handleForward}
          disabled={!activeTab?.canGoForward}
          className="icon-btn"
          title="前进 (Alt+→)"
        >
          →
        </button>
        <button onClick={handleReload} className="icon-btn" title="刷新 (Ctrl+R)">
          ↻
        </button>
      </div>

      {/* 标签列表（可滚动区域；「+」固定在外面，永远可见） */}
      <div style={styles.tabList} className="no-drag">
        {visibleTabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(tab.id)
            }}
            onDragLeave={() => setOverId((cur) => (cur === tab.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(tab.id)
            }}
            onDragEnd={handleDragEnd}
            onAuxClick={(e) => handleAuxClick(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onClick={() => handleSwitchTab(tab.id)}
            title={tab.poppedOut ? '已在独立窗口中打开，点击唤醒该窗口' : undefined}
            className={
              'tab' +
              (tab.id === activeTabId ? ' active' : '') +
              (dragId === tab.id ? ' dragging' : '') +
              (overId === tab.id && dragId !== tab.id ? ' over' : '')
            }
          >
            {tab.poppedOut && <span style={styles.poppedBadge}>🪟</span>}
            {tab.symbol && <span style={styles.tabSymbol}>{tab.symbol.split('.')[0]}</span>}
            <span style={{ ...styles.tabTitle, ...(tab.poppedOut ? styles.tabTitlePopped : {}) }}>
              {truncate(tab.title || tab.url, 24)}
            </span>
            <button
              onClick={(e) => handleCloseTab(e, tab.id)}
              className="tab-close"
              title="关闭 (Ctrl+W)"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={handleNewTab}
        className="icon-btn no-drag"
        style={styles.newTabBtn}
        title="新建标签 (Ctrl+T)"
      >
        +
      </button>
      {popouts.length > 0 && (
        <button
          onClick={handleCloseAllPopouts}
          className="icon-btn no-drag"
          style={styles.popoutChip}
          title={`已弹出 ${popouts.length} 个独立窗口，点击全部收回主窗口`}
        >
          🪟 {popouts.length}
        </button>
      )}
      {/* 右侧留白：拖动/双击可移动和最大化窗口 */}
      <div className="drag-region" style={styles.dragSpacer} />
    </div>
  )
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: 36,
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-mantle)',
    paddingLeft: 4,
    paddingRight: 8,
    gap: 4,
  },
  navButtons: { display: 'flex', gap: 2, marginRight: 8 },
  tabList: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tabSymbol: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--blue)',
    background: 'rgba(var(--blue-rgb), 0.12)',
    borderRadius: 4,
    padding: '1px 4px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  tabTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  newTabBtn: { flexShrink: 0 },
  poppedBadge: { fontSize: 11, flexShrink: 0 },
  tabTitlePopped: { opacity: 0.65, fontStyle: 'italic' },
  popoutChip: { flexShrink: 0, fontSize: 11 },
  dragSpacer: { flex: 1, alignSelf: 'stretch' },
}
