import { useState } from 'react'
import { IPC_CHANNELS, type Space, type SpaceId } from '@shared/ipc'
import { useSpaces, notifySpacesChanged } from '../hooks/useSpaces'
import { SpaceEditor } from './SpaceEditor'
import { WatchlistPanel } from './WatchlistPanel'
import brandLogoUrl from '../assets/niu-browser-logo-full.svg'

interface SidebarProps {
  // 当前选中的空间（唯一真值，来自 App 的 activeSpace，与顶栏菜单保持一致）
  activeSpace?: SpaceId
  onSpaceChange?: (spaceId: SpaceId) => void
  // 当前页面识别出的股票代码，透传给自选股面板
  pageSymbol?: string | null
  // 侧边栏宽度（布局可调，默认 220）
  width?: number
  onOpenSettings?: () => void
  onOpenTrades?: () => void
  onOpenQuoteHistory?: () => void
  onOpenLinks?: () => void
  onOpenAgent?: () => void
  onOpenResearch?: () => void
  onOpenNotes?: () => void
}

export function Sidebar({
  activeSpace,
  onSpaceChange,
  pageSymbol,
  width = 220,
  onOpenSettings,
  onOpenTrades,
  onOpenQuoteHistory,
  onOpenLinks,
  onOpenAgent,
  onOpenResearch,
  onOpenNotes,
}: SidebarProps) {
  const { spaces } = useSpaces()
  // 高亮 / 删除判定统一使用 App 下发的 activeSpace，避免与顶栏菜单各持一份导致不同步
  const activeSpaceId = activeSpace ?? ''
  // 编辑态：无 space = 新建；有 space = 编辑该项（名称 + 图标）
  const [editing, setEditing] = useState<{ space?: Space } | null>(null)

  const handleSwitch = async (spaceId: SpaceId) => {
    await window.electronAPI.invoke(IPC_CHANNELS.SPACES_SWITCH, { spaceId })
    onSpaceChange?.(spaceId)
  }

  const handleSave = async (name: string, icon: string) => {
    const target = editing?.space
    setEditing(null)
    try {
      if (target) {
        await window.electronAPI.invoke(IPC_CHANNELS.SPACES_UPDATE, {
          spaceId: target.id,
          name,
          icon,
        })
      } else {
        await window.electronAPI.invoke(IPC_CHANNELS.SPACES_CREATE, { name, icon })
      }
      notifySpacesChanged()
    } catch (err) {
      window.alert((target ? '保存失败：' : '创建失败：') + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDelete = async (space: Space) => {
    if (spaces.length <= 1) {
      window.alert('至少需要保留一个空间')
      return
    }
    if (!window.confirm(`删除空间「${space.name}」？该空间下的标签会全部关闭（浏览历史保留）。`)) return
    setEditing(null)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SPACES_DELETE, { spaceId: space.id })
      // 若删掉的是当前活动空间，主进程已切到剩余第一个；这里同步外壳状态
      if (activeSpaceId === space.id) {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.SPACES_GET_ALL, {})
        const first = res.spaces[0]?.id
        if (first) {
          await window.electronAPI.invoke(IPC_CHANNELS.SPACES_SWITCH, { spaceId: first })
          onSpaceChange?.(first)
        }
      }
      notifySpacesChanged()
    } catch (err) {
      window.alert('删除失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div style={{ ...styles.container, width }}>
      <div style={styles.logo}>
        <img
          src={brandLogoUrl}
          alt="牛Browser 炒股专用浏览器"
          style={styles.logoImage}
          draggable={false}
        />
      </div>

      <div style={styles.spaceList}>
        {spaces.map((space) => (
          <div key={space.id}>
            <button
              onClick={() => handleSwitch(space.id)}
              className={'space-btn' + (activeSpaceId === space.id ? ' active' : '')}
              title={`切换到${space.name}空间`}
            >
              <span className="icon">{space.icon}</span>
              <span style={styles.spaceName}>{space.name}</span>
              <span
                className="space-edit-btn"
                title="编辑名称与图标"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing({ space })
                }}
              >
                ✎
              </span>
            </button>
            {/* 编辑卡就近插在被编辑项下方 */}
            {editing?.space?.id === space.id && (
              <div style={{ padding: '4px 8px 6px' }}>
                <SpaceEditor
                  initialName={space.name}
                  initialIcon={space.icon}
                  saveLabel="保存"
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                  onDelete={spaces.length > 1 ? () => handleDelete(space) : undefined}
                />
              </div>
            )}
          </div>
        ))}
        {editing && !editing.space ? (
          <div style={{ padding: '4px 8px 6px' }}>
            <SpaceEditor
              saveLabel="创建"
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          !editing && (
            <button
              onClick={() => setEditing({})}
              className="space-btn"
              title="新建空间"
              style={{ color: 'var(--overlay0)', justifyContent: 'center' }}
            >
              ＋ 新建空间
            </button>
          )
        )}
      </div>

      {/* 自选股面板 */}
      <div style={styles.watchlistSection}>
        <WatchlistPanel pageSymbol={pageSymbol} />
      </div>

      {/* 底部入口：两列网格，避免 6 个按钮竖排吃掉自选股的高度 */}
      <div style={styles.footerGrid}>
        {onOpenTrades && (
          <FooterButton onClick={onOpenTrades} title="交易记录与复盘">
            📝 交易复盘
          </FooterButton>
        )}
        {onOpenQuoteHistory && (
          <FooterButton onClick={onOpenQuoteHistory} title="行情回放">
            📊 行情回放
          </FooterButton>
        )}
        {onOpenLinks && (
          <FooterButton onClick={onOpenLinks} title="当前页面链接">
            📎 本页链接
          </FooterButton>
        )}
        {onOpenAgent && (
          <FooterButton onClick={onOpenAgent} title="AI 研究 → 深度研究（自主联网调研）">
            🕸 深度研究
          </FooterButton>
        )}
        {onOpenResearch && (
          <FooterButton onClick={onOpenResearch} title="AI 研究 → 研究报告库">
            📚 研究报告
          </FooterButton>
        )}
        {onOpenNotes && (
          <FooterButton onClick={onOpenNotes} title="笔记：记录 / 与 AI 讨论 / 知识库">
            📒 笔记
          </FooterButton>
        )}
        {onOpenSettings && (
          <FooterButton onClick={onOpenSettings} title="设置">
            ⚙ 设置
          </FooterButton>
        )}
      </div>
    </div>
  )
}

/** 底部入口按钮：悬停反馈由全局 .side-btn class 提供 */
function FooterButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} className="side-btn">
      {children}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    // 比主区深一档的表面色 + 右边框：与中间面板形成明确边界（VSCode 侧栏同款层次）
    background: 'var(--bg-mantle)',
    borderRight: '1px solid var(--border)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  logo: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  logoImage: {
    height: 28,
    width: 'auto',
    maxWidth: '100%',
    objectFit: 'contain',
    display: 'block',
    userSelect: 'none',
  } as React.CSSProperties,
  spaceList: {
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flexShrink: 0,
    borderBottom: '1px solid var(--border)',
  },
  spaceName: {
    flex: 1,
  },
  watchlistSection: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  footerGrid: {
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderTop: '1px solid var(--border)',
  },
}
