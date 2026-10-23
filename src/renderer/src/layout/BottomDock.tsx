import { useState } from 'react'
import { DOCK_TABS, type DockTab } from './config'
import { ResizeHandle } from './ResizeHandle'

/**
 * 底部面板
 *
 * 放「随时想瞄一眼、但不该霸占主区」的信息：浏览轨迹、运行日志。
 * 顶部手柄调高度，标签切换内容。
 */
export function BottomDock({
  height,
  activeTab,
  onTabChange,
  onClose,
  onResizeStart,
  children,
}: {
  height: number
  activeTab: DockTab
  onTabChange: (tab: DockTab) => void
  onClose: () => void
  onResizeStart: (e: React.PointerEvent, el: HTMLElement) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ ...styles.container, height }}>
      <ResizeHandle orientation="horizontal" onPointerDown={onResizeStart} title="拖拽调整高度" />
      <div className="panel-header">
        <div style={styles.tabList}>
          {DOCK_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              active={tab.id === activeTab}
              title={tab.title}
              onClick={() => onTabChange(tab.id)}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
            </TabButton>
          ))}
        </div>
        <button onClick={onClose} title="关闭底部面板" className="icon-btn">
          ×
        </button>
      </div>
      <div style={styles.body}>{children}</div>
    </div>
  )
}

function TabButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.tab,
        ...(hover && !active ? styles.tabHover : {}),
        ...(active ? styles.tabActive : {}),
      }}
    >
      {children}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    borderTop: '1px solid var(--border)',
    overflow: 'hidden',
  },
  tabList: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 14px',
    height: 30,
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: 'var(--overlay0)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'color 0.15s, border-bottom-color 0.15s',
  },
  tabIcon: { fontSize: 12 },
  tabHover: { color: 'var(--subtext0)' },
  tabActive: { color: 'var(--text)', borderBottomColor: 'var(--blue)', fontWeight: 500 },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
}
