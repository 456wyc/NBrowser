import { useState, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'
import { ResearchPanel } from './components/ResearchPanel'
import { AiSettingsPage } from './pages/AiSettings'
import { AppSettingsPage } from './pages/AppSettings'
import { AgentCapabilitiesPage } from './pages/AgentCapabilitiesPage'
import { PetSettingsPage } from './pages/PetSettings'
import { TradesPanel } from './pages/TradesPanel'
import { QuoteHistoryPanel } from './pages/QuoteHistoryPanel'
import { PageLinksPanel } from './pages/PageLinksPanel'
import { NotesPanel } from './components/NotesPanel'
import { StrategyPanel } from './pages/StrategyPanel'
import { TodayVisitsPage } from './pages/TodayVisits'
import { LogPanel } from './pages/LogPanel'
import { CopilotDock } from './components/CopilotDock'
import { AppMenuBar } from './components/AppMenuBar'
import { useCopilot } from './hooks/useCopilot'
import { useAiAnalysis } from './hooks/useAiAnalysis'
import { useTabs } from './hooks/useTabs'
import { IPC_CHANNELS, type SpaceId } from '@shared/ipc'
import { isNavHomeUrl } from '@shared/url'
import { useLayout, useWebAreaBounds } from './layout/useLayout'
import type { ResearchTier, ResearchView } from './layout/config'
import { LayoutToolbar } from './layout/LayoutToolbar'
import { SecondaryPanel } from './layout/SecondaryPanel'
import { BottomDock } from './layout/BottomDock'
import { ResizeHandle } from './layout/ResizeHandle'
import { useThemeMode } from './lib/themeMode'

/**
 * 应用外壳：只负责把五个区域摆好，并把各区域的显隐/尺寸交给 useLayout
 *
 * VSCode 式布局：右侧辅助侧栏占整个右侧全高，底部面板只属于中间列——
 * 两者互不嵌套、互不挤压。
 *
 * ┌────────────────── 顶栏（固定）──────────────────┐
 * │ 标签栏 + 地址栏 + 布局控制                        │
 * ├────────┬────────────────────────┬──────────────┤
 * │ 主侧栏 │  主区（网页视图占位）   │              │
 * │        ├────────────────────────┤  辅助侧栏    │
 * │        │ 底部面板（轨迹/日志）   │  （全高）    │
 * ├────────┴────────────────────────┴──────────────┤
 */
function App() {
  const [activeSpace, setActiveSpace] = useState<SpaceId>('watch')
  const [activeTabKey, setActiveTabKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  // 设置页内部分栏：AI 设置（模型/Key）、应用设置（轨迹/黑名单/日历）、Agent 能力、桌宠
  const [settingsTab, setSettingsTab] = useState<'ai' | 'app' | 'agent' | 'pet'>('ai')
  // 「🔍 研究」模块内部状态：深度分档（快览/深挖/深度研究）与子视图（分档/报告库）
  const [researchTier, setResearchTier] = useState<ResearchTier>('quick')
  const [researchView, setResearchView] = useState<ResearchView>('tiers')
  // 地址栏下拉展开时主区顶部要让出的高度（0 表示没有下拉）
  const [addrOverlay, setAddrOverlay] = useState(0)
  // 缩放提示：Cmd/Ctrl +/- 后短暂显示当前百分比
  const [zoomTip, setZoomTip] = useState<number | null>(null)

  const layout = useLayout()
  const { ref: webAreaRef, sync: syncWebArea } = useWebAreaBounds()
  // 主壳是主题的唯一写入方：其它实例（新标签页视图等）只跟随，避免多方写入互相覆盖
  const { mode: themeMode, toggle: toggleTheme } = useThemeMode({ authoritative: true })

  // AI 桌宠显隐：桌宠是独立浮窗，隐藏后靠顶栏这个按钮 / 助手菜单唤回。
  // 启动时主进程已经把它显示出来了，所以初值为 true。
  const [petOn, setPetOn] = useState(true)
  const togglePet = async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PET_TOGGLE, { visible: !petOn })
      setPetOn(res.visible)
    } catch {
      /* 桌宠窗口不存在时忽略（比如还没创建成功） */
    }
  }

  // 主进程推送缩放变化（菜单快捷键 / 站点记忆恢复）
  useEffect(() => {
    const unsubscribe = window.electronAPI.onZoomChanged(({ percent }) => {
      setZoomTip(percent)
      window.setTimeout(() => setZoomTip(null), 1600)
    })
    return unsubscribe
  }, [])

  // AI 助手（Copilot）：Cmd/Ctrl+K 或菜单「助手 → AI 助手」召唤
  const copilot = useCopilot()
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCopilotOpen(() => copilot.setOpen(true))
    return unsubscribe
  }, [copilot.setOpen])

  // 切到内置「笔记」空间时，自动打开笔记面板（内容在面板里，而非网页区）
  useEffect(() => {
    if (activeSpace === 'notes' && !(layout.layout.panelVisible && layout.layout.panelTab === 'notes')) {
      layout.openPanel('notes')
    }
    // 仅在空间切换时判断，避免和面板的正常开合互相打架
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpace])
  // 状态驱动的布局变化（侧栏/面板/底部显隐或尺寸）不一定触发 ResizeObserver，
  // 这里显式兜底：每次 layout 状态变化后下一帧同步一次网页区矩形。
  useEffect(() => {
    const frame = requestAnimationFrame(syncWebArea)
    return () => cancelAnimationFrame(frame)
  }, [layout.layout, syncWebArea])

  const ai = useAiAnalysis()
  const { activeTab } = useTabs()

  /**
   * 三空间差异化默认内容（FR-2.5）：
   * 空间即场景——切到哪个空间，右侧面板就落到该场景的主功能，
   * 用户不必记住「这个空间该打开哪个面板」，认知负荷从 18 个入口降到 3 个场景。
   * - 盯盘 📊 → 行情回放（侧栏自选股本就常驻，面板补走势）
   * - 研究 🔍 → AI 研究（快览档）
   * - 复盘 📝 → 交易与复盘
   * 自定义空间不干预（保留用户自己的布局习惯）。
   */
  const handleSpaceChange = (spaceId: SpaceId) => {
    setActiveSpace(spaceId)
    // 强制刷新标签栏，让它重新加载新空间的标签
    setActiveTabKey((k) => k + 1)
    if (spaceId === 'watch') {
      layout.setPanelTab('quoteHistory')
    } else if (spaceId === 'research') {
      setResearchTier('quick')
      setResearchView('tiers')
      layout.setPanelTab('research')
    } else if (spaceId === 'review') {
      layout.setPanelTab('trades')
    }
  }

  // 右键菜单分析完成后，若面板没开则自动展开到「研究 → 快览」（不顶掉用户已打开的其他内容）
  useEffect(() => {
    if (ai.result && !layout.layout.panelVisible) {
      setResearchTier('quick')
      setResearchView('tiers')
      layout.setPanelTab('research')
    }
    // 只在分析结果变化时判断，避免布局一变就抢焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.result])

  const closePanel = useCallback(() => layout.closePanel(), [layout])
  // 地址栏 ✨：打开「研究 → 快览」并分析当前页（用 setPanelTab 而非 openPanel，避免已在研究标签时被 toggle 关掉）
  const openAiPanel = useCallback(async () => {
    setResearchTier('quick')
    setResearchView('tiers')
    layout.setPanelTab('research')
    await ai.analyzePage()
  }, [ai, layout])

  const openAiSettings = useCallback(() => {
    setSettingsTab('ai')
    layout.openPanel('settings')
  }, [layout])

  const toggleFullscreen = async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN, {})
      setFullscreen(res.fullscreen)
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err)
    }
  }

  const { panelTab, panelVisible, dockTab, dockVisible } = layout.layout
  // 生效尺寸：已按当前窗口大小收敛过，窗口拉小时四周自动让位给主区
  const { sidebarWidth, panelWidth, dockHeight } = layout.effective
  // 当前标签是否为应用内新标签页（此时没有网址可输入，顶栏搜索框隐藏、留白可拖拽）
  const navActive = !!activeTab && isNavHomeUrl(activeTab.url)

  return (
    <div style={styles.app}>
      {/* 缩放提示：主进程快捷键改缩放后短暂显示 */}
      {zoomTip !== null && (
        <div style={styles.zoomTip}>缩放 {zoomTip}%</div>
      )}

      {/* 左侧：主侧栏（空间切换 + 自选股 + 快捷入口），可收起、可调宽 */}
      {layout.layout.sidebarVisible && (
        <>
          <Sidebar
            width={sidebarWidth}
            activeSpace={activeSpace}
            onSpaceChange={handleSpaceChange}
            pageSymbol={activeTab?.symbol ?? null}
            onOpenSettings={() => {
              setSettingsTab('app')
              layout.openPanel('settings')
            }}
            onOpenTrades={() => layout.openPanel('trades')}
            onOpenQuoteHistory={() => layout.openPanel('quoteHistory')}
            onOpenLinks={() => layout.openPanel('links')}
            // 研究模块的两个入口：深度研究（分档 → 深度研究）与报告库（子视图）
            onOpenAgent={() => {
              setResearchTier('deep')
              setResearchView('tiers')
              layout.setPanelTab('research')
            }}
            onOpenResearch={() => {
              setResearchView('reports')
              layout.setPanelTab('research')
            }}
            onOpenNotes={() => layout.openPanel('notes')}
          />
          <ResizeHandle
            orientation="vertical"
            onPointerDown={(e) => layout.startSidebarDrag(e, e.currentTarget as HTMLElement)}
            title="拖拽调整宽度（拖到最左侧可收起）"
          />
        </>
      )}

      {/* 右侧：主区域 */}
      <div style={styles.mainArea}>
        {/* 顶栏（VSCode 式单行菜单栏）：应用 logo + 搜索框 + 布局控制 + 窗口控制。空间切换统一在左侧侧栏完成 */}
        <div style={styles.topBar} className="drag-region">
          <div style={styles.brand} className="no-drag">🚢</div>
          <AppMenuBar />
          <div
            style={styles.addrWrap}
            className={navActive ? 'drag-region' : 'no-drag'}
          >
            <AddressBar
              key={`addr-${activeSpace}-${activeTabKey}`}
              onAnalyze={openAiPanel}
              analyzing={ai.loading}
              onSuggestOverlayChange={setAddrOverlay}
            />
          </div>
          <div className="no-drag">
            <LayoutToolbar
              sidebarOn={layout.layout.sidebarVisible}
              panelOn={panelVisible}
              dockOn={dockVisible}
              fullscreen={fullscreen}
              onToggleSidebar={layout.toggleSidebar}
              onTogglePanel={layout.togglePanel}
              onToggleDock={layout.toggleDock}
              onToggleFullscreen={toggleFullscreen}
              onReset={layout.resetLayout}
            />
          </div>
          <div className="no-drag" style={{ display: 'flex', gap: 2 }}>
            <button
              className={'icon-btn' + (copilot.open ? ' active' : '')}
              style={copilot.open ? { color: 'var(--blue)' } : undefined}
              onClick={() => copilot.setOpen(!copilot.open)}
              title="AI 助手（Cmd/Ctrl+K）"
            >
              🤖
            </button>
            {/* AI 桌宠开关：桌宠是独立浮窗，藏起来之后就靠这里（或助手菜单 / Ctrl+Shift+P）唤回来 */}
            <button
              className={'icon-btn' + (petOn ? ' active' : '')}
              style={petOn ? { color: 'var(--blue)' } : undefined}
              onClick={() => void togglePet()}
              title="牛来（Cmd/Ctrl+Shift+P）"
            >
              🐮
            </button>
          </div>
          <div className="no-drag">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          {/* 系统窗口控制按钮（overlay）绘制在最上层，这里留出它的位置 */}
          <div className="drag-region" style={styles.overlaySpacer} />
        </div>

        {/* 中部：标签行 + 网页区 + 底部面板（中间列）+ 右侧全高辅助侧栏 */}
        <div style={styles.contentRow}>
          <div style={styles.centerCol}>
            <TabBar key={`tabs-${activeSpace}-${activeTabKey}`} />

            {/*
              AI 助手：作为 flex 节点插在网页区上方——网页是独立 WebContentsView、
              盖在 DOM 之上，fixed 浮层会被遮住；flex 让位后网页区自然收缩，
              useWebAreaBounds 的 ResizeObserver 会把新矩形同步给主进程。
            */}
            {copilot.open && (
              <CopilotDock
                messages={copilot.messages}
                running={copilot.running}
                error={copilot.error}
                sessions={copilot.sessions}
                sessionId={copilot.sessionId}
                pendingAction={copilot.pendingAction}
                onSend={(text) => void copilot.send(text, activeTab?.url)}
                onStop={() => void copilot.stop()}
                onConfirmAction={(approved) => void copilot.confirmAction(approved)}
                onNewSession={copilot.newSession}
                onLoadSession={(id) => void copilot.loadSession(id)}
                onDeleteSession={(id) => void copilot.removeSession(id)}
                onClose={() => copilot.setOpen(false)}
              />
            )}

            {/*
              地址栏下拉让位条：网页是独立的 WebContentsView，盖在 DOM 之上，
              下拉只有让它下面的网页视图收缩才看得见。这里撑出一条与下拉等高的空白，
              网页区随之变矮，主进程把网页视图同步收窄，下拉就露出来了。
            */}
            {addrOverlay > 0 && <div style={{ ...styles.addrOverlay, height: addrOverlay }} />}

            {/*
              网页区占位：真实内容由主进程 WebContentsView 渲染。
              这个 div 的矩形会被实测并上报给主进程，所以不要给它加边距/边框，
              任何样式变化都会直接改变网页视图的位置。
              新标签页就是 #/nav 路由的 NavHome（在标签里渲染），外壳这里绝不能再渲染一份。
            */}
            <div ref={webAreaRef} style={styles.webArea} />

            {/* 底部面板（浏览轨迹 / 运行日志）：只属于中间列，不横跨右侧侧栏 */}
            {dockVisible && (
              <BottomDock
                height={dockHeight}
                activeTab={dockTab}
                onTabChange={layout.setDockTab}
                onClose={layout.closeDock}
                onResizeStart={(e, el) => layout.startDockDrag(e, el)}
              >
                {dockTab === 'visits' ? <TodayVisitsPage compact /> : <LogPanel />}
              </BottomDock>
            )}
          </div>

          {/* 右侧辅助侧栏：占整个右侧全高；拖拽手柄放在面板外部（与主侧栏同模式） */}
          {panelVisible && (
            <>
              <ResizeHandle
                orientation="vertical"
                onPointerDown={(e) => layout.startPanelDrag(e, e.currentTarget as HTMLElement)}
                title="拖拽调整宽度（拖到最窄可收起）"
              />
              <SecondaryPanel
                width={panelWidth}
                activeTab={panelTab}
                onTabChange={layout.setPanelTab}
                onClose={layout.closePanel}
              >
                {panelTab === 'research' && (
                  <ResearchPanel
                    tier={researchTier}
                    onTierChange={setResearchTier}
                    view={researchView}
                    onViewChange={setResearchView}
                    ai={ai}
                    onClosePanel={closePanel}
                    onOpenAiSettings={openAiSettings}
                  />
                )}
                {panelTab === 'strategy' && <StrategyPanel />}
                {panelTab === 'trades' && <TradesPanel />}
                {panelTab === 'quoteHistory' && <QuoteHistoryPanel />}
                {panelTab === 'links' && <PageLinksPanel />}
                {panelTab === 'notes' && <NotesPanel />}
                {panelTab === 'settings' && (
                  <div style={styles.settingsWrap}>
                    <div className="seg">
                      <SegButton
                        active={settingsTab === 'ai'}
                        onClick={() => setSettingsTab('ai')}
                      >
                        AI 设置
                      </SegButton>
                      <SegButton
                        active={settingsTab === 'app'}
                        onClick={() => setSettingsTab('app')}
                      >
                        应用设置
                      </SegButton>
                      <SegButton
                        active={settingsTab === 'agent'}
                        onClick={() => setSettingsTab('agent')}
                      >
                         Agent 能力
                      </SegButton>
                      <SegButton
                        active={settingsTab === 'pet'}
                        onClick={() => setSettingsTab('pet')}
                      >
                        🐮 牛来
                      </SegButton>
                    </div>
                    <div style={styles.settingsBody}>
                      {settingsTab === 'ai' && <AiSettingsPage />}
                      {settingsTab === 'app' && <AppSettingsPage />}
                      {settingsTab === 'agent' && <AgentCapabilitiesPage />}
                      {settingsTab === 'pet' && <PetSettingsPage />}
                    </div>
                  </div>
                )}
              </SecondaryPanel>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={'seg-btn' + (active ? ' active' : '')}
    >
      {children}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  zoomTip: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 9999,
    padding: '6px 12px',
    borderRadius: 6,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  },
  app: {
    width: '100%',
    height: '100%',
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg-base)',
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  topBar: {
    flexShrink: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    height: 36,
    background: 'var(--bg-mantle)',
    borderBottom: '1px solid var(--border)',
    paddingLeft: 4,
  },
  brand: {
    flexShrink: 0,
    padding: '0 6px 0 8px',
    fontSize: 15,
  },
  menu: {
    display: 'flex',
    flexShrink: 0,
  },
  addrWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  overlaySpacer: { flexShrink: 0, width: 144, alignSelf: 'stretch' },
  contentRow: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    overflow: 'hidden',
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  addrOverlay: {
    flexShrink: 0,
    background: 'var(--bg-base)',
  },
  webArea: {
    flex: 1,
    minWidth: 0,
    // 不要加 padding/border：这个矩形的尺寸会直接同步给主进程的网页视图
    background: 'var(--bg-base)',
  },
  settingsWrap: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  settingsBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
}

export default App
