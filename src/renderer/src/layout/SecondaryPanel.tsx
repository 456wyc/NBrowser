import { useState } from 'react'
import { PANEL_TABS, type PanelTab } from './config'

/**
 * 右侧辅助侧栏（Secondary Sidebar）
 *
 * 一块区域收口所有「工具型」内容：AI 分析、深度研究、研究报告、交易复盘、
 * 行情回放、本页链接、设置。用顶部标签切换，而不是每次打开都互相顶掉——
 * 之前点头像进设置、再点回来分析结果就没了，就是因为内容是互斥覆盖的。
 *
 * 内容由 App 通过 children 注入，这里只管壳（标签条 + 关闭）。
 * 拖拽手柄由 App 放在本组件外部（左侧），避免 overflow 容器裁剪命中区。
 */
export function SecondaryPanel({
  width,
  activeTab,
  onTabChange,
  onClose,
  children,
}: {
  width: number
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ ...styles.container, width }}>
      <div style={styles.content}>
        <div className="panel-header">
          <div style={styles.tabList}>
            {PANEL_TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <TabButton
                  key={tab.id}
                  active={active}
                  title={tab.title}
                  onClick={() => onTabChange(tab.id)}
                >
                  <span style={styles.tabIcon}>{tab.icon}</span>
                  {tab.label}
                </TabButton>
              )
            })}
          </div>
          <button onClick={onClose} title="关闭侧栏" className="icon-btn">
            ×
          </button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
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
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    background: 'var(--bg-base)',
    borderLeft: '1px solid var(--border)',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
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
    padding: '0 12px',
    height: 34,
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
  tabIcon: { fontSize: 13 },
  tabHover: { color: 'var(--subtext0)' },
  tabActive: {
    color: 'var(--text)',
    borderBottomColor: 'var(--blue)',
    fontWeight: 500,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
}
