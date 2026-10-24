import {
  BrowserWindow,
  type WebContentsView,
  type WebContents,
  type ContextMenuParams,
} from 'electron'
import { TabManager } from './tab-manager'
import { PopoutWindowManager } from './popout-window'
import { loadSpaces, type SpaceId } from './space-manager'
import type { Tab, AiAnalysisDonePayload, Space, ThemeMode } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { Database } from 'sql.js'
import { aiService } from '../ai/service'
import { buildWebContextMenu } from '../context-menu'
import { runInHeadlessPage } from './headless-page'
import { addToWatchlist } from '../db/watchlist'
import {
  getSearchEngineTemplate,
  getSession,
  getSpaces,
  isSessionRestoreEnabled,
  setSession,
  setSpaces,
} from '../db/settings'
import {
  buildSession,
  sanitizeSession,
  tabsForSpace,
  windowsForRestoredTabs,
  type SessionTab,
} from '@shared/session-restore'
import { getDb } from '../db'
import { PageVisitTracker } from '../tracking/page-tracker'

/**
 * 网页区布局
 *
 * 核心约定：**主进程不猜布局**。顶栏高度、拖拽手柄宽度、边框粗细、各区域显隐
 * 全都是渲染进程的 DOM 决定的；渲染进程用 getBoundingClientRect() 量出网页区占位
 * 元素的真实矩形，通过 window:setWebAreaBounds 上报，主进程照搬给 WebContentsView。
 *
 * 这样窗口缩放、全屏切换、侧栏折叠、面板拖拽、手柄宽度变化都不需要两边对齐常量，
 * 也就不会再出现「网页视图盖住手柄 / 地址栏」这类错位。
 */
export interface WebAreaBounds {
  x: number
  y: number
  width: number
  height: number
}

// 首帧兜底：渲染进程还没上报矩形时（窗口刚创建、还没挂载 React），
// 先按经验值放一个大致位置，渲染进程一挂载就会覆盖为真实值。
const FALLBACK_SIDEBAR_WIDTH = 220
const FALLBACK_TOP_BAR_HEIGHT = 72

export class MainWindowManager {
  private window: BrowserWindow
  private tabManagers: Map<SpaceId, TabManager> = new Map()
  private activeSpace: SpaceId = ''
  private sidebarView: WebContentsView | null = null
  private db: Database
  private pageTrackers: Map<string, PageVisitTracker> = new Map() // tabId -> tracker
  // 网页区矩形：由渲染进程实测后上报（见文件头注释）
  private webArea: WebAreaBounds = { x: 0, y: 0, width: 0, height: 0 }
  private webAreaSynced = false // 渲染进程是否已上报过真实矩形
  private tabsPushTimer: NodeJS.Timeout | null = null // 标签推送节流定时器
  private sessionPersistTimer: NodeJS.Timeout | null = null // 会话存档防抖定时器
  private sessionFinalized = false // 已做过退出前最后一次存档
  // 当前主题模式：THEME_SET 时更新并同步原生按钮配色；新页面挂载经 THEME_GET 对齐
  private theme: ThemeMode = 'dark'
  // 独立窗口：把标签页弹出成真正的 OS 窗口，多屏时可以各显示一份内容
  private popout: PopoutWindowManager

  constructor(db: Database) {
    this.db = db
    this.window = this.createWindow()
    this.popout = this.createPopoutManager()
    // 按持久化的空间列表（含自定义空间）初始化标签管理器
    const spaces = loadSpaces(db)
    this.activeSpace = spaces[0]?.id ?? ''
    for (const space of spaces) {
      this.createTabManagerFor(space)
    }
    this.restoreSession()
    this.setupWindowEvents()
  }

  /**
   * 恢复上次的会话：标签页 + 独立窗口（含它们各自在哪块屏幕上）
   *
   * 多屏用户的诉求是「每块屏幕放不同的内容」，只恢复标签不够——
   * 窗口位置（属于哪块显示器）一并记住，重启后直接摆回原处。
   * 页面内的 JS 状态不恢复（那需要重建 WebContents），只保证「打开的东西还在、摆的位置还在」。
   */
  private restoreSession(): void {
    try {
      if (!isSessionRestoreEnabled(this.db)) return
      const session = sanitizeSession(getSession(this.db), {
        spaceIds: Array.from(this.tabManagers.keys()),
      })
      if (session.tabs.length === 0) return

      for (const [spaceId, tm] of this.tabManagers) {
        for (const saved of tabsForSpace(session.tabs, spaceId)) {
          // 已弹出的标签先不激活（随后会开独立窗口）；id 沿用存档值，窗口归属才对得上
          tm.createTab(saved.url, saved.isActive && !saved.poppedOut, saved.id)
        }
      }

      // 当前空间若没有活动标签（存档里的活动标签已弹出/缺失），退到最后一个未弹出的
      const activeTm = this.tabManagers.get(this.activeSpace)
      if (activeTm && !activeTm.getActiveTabId()) activeTm.showActive()

      let restoredWindows = 0
      const restorableIds = session.tabs.map((t) => t.id)
      for (const w of windowsForRestoredTabs(session.windows, restorableIds)) {
        // 只恢复确实还在的标签（存档里指向已失效标签的 id 直接丢掉）
        const tabIds = w.tabIds.filter((id) => this.getTabManagerForTab(id))
        if (tabIds.length === 0) continue
        const res = this.popout.restoreWindow(w.id, tabIds, w.activeTabId, w.bounds)
        if (res.success) restoredWindows += 1
      }
      console.log(`[session] 恢复 ${session.tabs.length} 个标签、${restoredWindows} 个独立窗口`)
    } catch (err) {
      // 恢复失败不能影响启动：最坏情况就是回到「只开一个导航页」
      console.error('[session] 会话恢复失败，回退到默认导航页：', err)
    }
  }

  /**
   * 保存会话（标签变更 / 独立窗口增减后延迟写入，避免每帧写库）
   */
  private scheduleSessionPersist(): void {
    if (this.sessionPersistTimer) return
    this.sessionPersistTimer = setTimeout(() => {
      this.sessionPersistTimer = null
      this.persistSessionNow()
    }, 1500)
  }

  /**
   * 退出前最后一次保存，并锁住存档
   *
   * 锁住的原因：关主窗口时会先存档（此时独立窗口还开着，能记住它们的位置），
   * 随后才销毁独立窗口；若不锁，后续 window-all-closed / before-quit 再存一次，
   * 就会把「窗口已经没了」写进存档，下次启动什么都不恢复。
   */
  finalizeSession(): void {
    this.persistSessionNow()
    this.sessionFinalized = true
  }

  /** 立即落盘（退出前调用，否则最后一次改动可能还没到 debounce 时间） */
  persistSessionNow(): void {
    if (this.sessionFinalized) return
    try {
      if (this.sessionPersistTimer) {
        clearTimeout(this.sessionPersistTimer)
        this.sessionPersistTimer = null
      }
      const tabs: SessionTab[] = []
      for (const tm of this.tabManagers.values()) {
        tabs.push(...tm.snapshotTabs())
      }
      // 标注每个标签属于哪个独立窗口（重启后要把整组标签摆回同一个窗口）
      for (const tab of tabs) {
        const windowId = this.popout.windowIdOf(tab.id)
        if (windowId) tab.windowId = windowId
      }
      setSession(this.db, buildSession(tabs, this.popout.snapshotWindows()))
    } catch (err) {
      console.error('[session] 保存会话失败：', err)
    }
  }

  /** 为单个空间创建标签管理器（启动与新增空间共用） */
  private createTabManagerFor(space: Space): TabManager {
    const tm = new TabManager(this.window, space.id, {
      hooks: {
        onTabCreated: (tabId, webContents, spaceId) => {
          this.attachPageTracker(tabId, webContents, spaceId)
          this.attachContextMenu(webContents)
        },
        // 标签被关掉时，它若已弹出为独立窗口，先把那个窗口收掉（不还原标签）
        onBeforeTabClosed: (tabId) => this.popout.discard(tabId),
        onTabClosed: (tabId) => this.detachPageTracker(tabId),
        // 已弹出的标签里开新页（window.open / target=_blank）：开在**同一个独立窗口**里
        onPopoutNewTab: (sourceTabId, newTabId) => {
          const windowId = this.popout.windowIdOf(sourceTabId)
          if (windowId) this.popout.addTabToWindow(windowId, newTabId)
        },
        onTabsChanged: (spaceId) => this.broadcastTabs(spaceId),
      },
      // 搜索词按设置里的默认搜索引擎转换（实时读取，改完即生效）
      searchTemplateProvider: () => getSearchEngineTemplate(this.db),
    })
    this.tabManagers.set(space.id, tm)
    return tm
  }

  /**
   * 在指定独立窗口里新开一页（窗口「+」与 Ctrl+T 共用）
   *
   * 新标签建在窗口内第一个标签所属的空间里（一个窗口不跨空间混装），
   * 然后直接并进该窗口，绝不会跑到主窗口去。
   */
  newTabInPopoutWindow(windowId: string, url?: string): string | null {
    const first = this.popout.listTabs(windowId).tabs[0]
    const tm = first
      ? (this.getTabManagerForTab(first.tabId) ?? this.getTabManager())
      : this.getTabManager()
    const tab = tm.createTab(url, false)
    const ok = this.popout.addTabToWindow(windowId, tab.id)
    return ok ? tab.id : null
  }

  /**
   * 独立窗口管理器
   *
   * 标签分散在各个空间里，弹出/收回都要先定位它属于哪个空间，这里统一兜住；
   * 变化同时广播标签列表（标签上的 🪟 标记）与独立窗口列表。
   */
  private createPopoutManager(): PopoutWindowManager {
    const findOwner = (tabId: string): { tm: TabManager; spaceId: SpaceId } | null => {
      for (const [spaceId, tm] of this.tabManagers) {
        if (tm.hasTab(tabId)) return { tm, spaceId }
      }
      return null
    }

    return new PopoutWindowManager(
      {
        findTab: (tabId) => {
          const owner = findOwner(tabId)
          if (!owner) return null
          const tab = owner.tm.getAllTabs().find((t) => t.id === tabId)
          return { spaceId: owner.spaceId, title: tab?.title ?? '', url: tab?.url ?? '' }
        },
        detachTab: (tabId) => {
          const owner = findOwner(tabId)
          return owner ? owner.tm.detachForPopout(tabId) : null
        },
        restoreTab: (tabId, makeActive) => {
          const owner = findOwner(tabId)
          if (!owner) return
          // 只有当前前台空间的标签才立刻挂回主窗口；其它空间清标记即可，
          // 否则会把别的空间的内容盖在当前空间上
          if (owner.spaceId === this.activeSpace) owner.tm.attachFromPopout(tabId, makeActive)
          else owner.tm.markReturnedFromPopout(tabId)
        },
        notifyChanged: () => {
          this.broadcastTabs(this.activeSpace)
          this.broadcastPopouts()
          // 独立窗口增减/页面跳转也要记进会话（窗口位置靠它还原）
          this.scheduleSessionPersist()
        },
      },
      this.db
    )
  }

  /** 供 IPC 层读写独立窗口 */
  getPopoutManager(): PopoutWindowManager {
    return this.popout
  }

  /** 向渲染进程推送最新的独立窗口列表 */
  private broadcastPopouts(): void {
    if (this.window.isDestroyed()) return
    this.window.webContents.send(IPC_CHANNELS.WINDOWS_UPDATED, {
      windows: this.popout.list(),
    })
  }

  // ---------- 自定义空间 ----------

  /** 新建空间：id 用时间戳生成且此后不可变（session partition 依赖其稳定性） */
  createSpace(name: string, icon?: string): Space {
    const spaces = getSpaces(this.db)
    const space: Space = {
      id: `space-${Date.now()}`,
      name: name.trim(),
      icon: icon?.trim() || '🗂',
    }
    setSpaces(this.db, [...spaces, space])
    this.createTabManagerFor(space)
    return space
  }

  /** 重命名 / 换图标（不动 id，登录态保留） */
  updateSpace(spaceId: SpaceId, patch: { name?: string; icon?: string }): Space {
    const spaces = getSpaces(this.db)
    const idx = spaces.findIndex((s) => s.id === spaceId)
    if (idx < 0) throw new Error(`空间不存在: ${spaceId}`)
    const updated: Space = {
      ...spaces[idx],
      ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim() } : {}),
      ...(patch.icon !== undefined && patch.icon.trim() ? { icon: patch.icon.trim() } : {}),
    }
    const next = [...spaces]
    next[idx] = updated
    setSpaces(this.db, next)
    return updated
  }

  /** 删除空间：先切走活动空间，再销毁该空间全部标签视图与管理器 */
  removeSpace(spaceId: SpaceId): number {
    const spaces = getSpaces(this.db)
    const remaining = spaces.filter((s) => s.id !== spaceId)
    if (remaining.length === spaces.length) throw new Error(`空间不存在: ${spaceId}`)
    if (remaining.length === 0) throw new Error('至少要保留一个空间')

    const tm = this.tabManagers.get(spaceId)
    let closedTabs = 0
    if (tm) {
      closedTabs = tm.getAllTabs().length
      // 若删除的是活动空间，先切到剩余的第一个，保证 activeSpace 不悬空
      if (this.activeSpace === spaceId) {
        this.activeSpace = remaining[0].id
        const target = this.tabManagers.get(this.activeSpace)
        target?.showActive()
      }
      tm.destroyAll()
      this.tabManagers.delete(spaceId)
    }

    setSpaces(this.db, remaining)
    // 该空间的浏览轨迹等历史数据保留在库里，只是过滤下拉中不再出现
    return closedTabs
  }

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: '牛Browser',
      // 参考 VSCode：隐藏原生标题栏，顶栏由渲染进程自绘（标签 + 地址栏一体化），
      // 右上角窗口控制按钮由系统 overlay 渲染，贴靠/双击最大化等行为全部保留。
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        // 与 --bg-mantle / --text 一致，叠加在标签行（36px）右侧
        color: '#181825',
        symbolColor: '#cdd6f4',
        height: 36,
      },
      webPreferences: {
        preload: require.resolve('../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      win.loadFile(require.resolve('../../renderer/index.html'))
    }

    return win
  }

  private setupWindowEvents(): void {
    // 窗口尺寸变化后，渲染进程会用 ResizeObserver 重新上报矩形；
    // 这里再兜一次底，避免渲染进程被阻塞时网页视图长时间错位。
    this.window.on('resize', () => this.applyWebAreaBounds())
    this.window.on('move', () => this.applyWebAreaBounds())

    this.window.once('ready-to-show', () => {
      this.applyWebAreaBounds()
      const tm = this.tabManagers.get(this.activeSpace)
      // 会话已恢复时不要再补一个导航页；只有该空间确实一个标签都没有才补
      if (tm && !tm.hasAnyTab()) tm.createTab()
    })
  }

  /** 把当前网页区矩形应用到标签视图 */
  private applyWebAreaBounds(): void {
    const tm = this.tabManagers.get(this.activeSpace)
    if (!tm) return
    const b = this.webAreaSynced ? this.webArea : this.fallbackBounds()
    tm.setWebAreaBounds(b.x, b.y, b.width, b.height)
  }

  /** 渲染进程尚未上报时的兜底矩形 */
  private fallbackBounds(): WebAreaBounds {
    const [width, height] = this.window.getContentSize()
    return {
      x: FALLBACK_SIDEBAR_WIDTH,
      y: FALLBACK_TOP_BAR_HEIGHT,
      width: Math.max(0, width - FALLBACK_SIDEBAR_WIDTH),
      height: Math.max(0, height - FALLBACK_TOP_BAR_HEIGHT),
    }
  }

  /**
   * 为标签挂上网页右键菜单（含「整理选中文本」）
   *
   * 不需要手动解绑：标签关闭时 webContents 会被 close()，
   * 挂在它上面的监听器随之释放，保存引用反而会造成泄漏。
   */
  private attachContextMenu(webContents: WebContents): void {
    webContents.on('context-menu', (_event, params: ContextMenuParams) => {
      // 右键发生在哪个窗口，菜单就弹在哪个窗口：独立窗口里右键不能弹回主窗口
      const ownerWindow = this.windowOfWebContents(webContents) ?? this.window
      const menu = buildWebContextMenu(params, {
        window: ownerWindow,
        webContents,
        onAnalyzeSelection: (text, url) => {
          this.analyzeSelection(text, webContents.getTitle() || '选中文本', url)
        },
        onOpenLink: (url, background) => {
          // 从哪个标签发起，新页就开在哪：
          // 独立窗口里右键「在新标签打开」要留在这个窗口，而不是跑到主窗口去
          const sourceTabId = this.findTabIdByWebContents(webContents)
          const sourceWindowId = sourceTabId ? this.popout.windowIdOf(sourceTabId) : null
          const tm =
            (sourceTabId ? this.getTabManagerForTab(sourceTabId) : null) ??
            this.tabManagers.get(this.activeSpace)
          if (!tm) return
          const tab = tm.createTab(url, !background && !sourceWindowId)
          if (sourceWindowId) this.popout.addTabToWindow(sourceWindowId, tab.id, !background)
        },
        onAnalyzeLink: (url) => this.analyzeLink(url),
        onAddLinkToWatch: (symbol) => this.addLinkToWatch(symbol),
      })
      menu.popup({ window: ownerWindow })
    })
  }

  /**
   * 无头加载一个链接并分析，结果推送到 AI 面板（右键「用 AI 分析此链接」）
   */
  private analyzeLink(url: string): void {
    ;(async () => {
      try {
        const view = await runInHeadlessPage(this.window, url, (wc) =>
          aiService.analyzeWebContents(wc, 'page')
        )
        this.pushAnalysis({ result: view, error: null })
      } catch (err: any) {
        this.pushAnalysis({ result: null, error: err?.message || String(err) })
      }
    })()
  }

  /**
   * 把链接里识别到的股票代码加入自选股
   */
  private async addLinkToWatch(symbol: string): Promise<void> {
    try {
      const db = await getDb()
      addToWatchlist(db, { symbol, name: symbol })
    } catch (err) {
      console.error('Failed to add link to watchlist:', err)
    }
  }

  /**
   * 分析选中的文本，并把结果推送给渲染进程展示
   */
  private analyzeSelection(text: string, title: string, url: string): void {
    ;(async () => {
      try {
        const result = await aiService.analyzeText({ text, title, url })
        this.pushAnalysis({ result, error: null })
      } catch (err: any) {
        this.pushAnalysis({ result: null, error: err?.message || String(err) })
      }
    })()
  }

  private pushAnalysis(payload: AiAnalysisDonePayload): void {
    if (this.window.isDestroyed()) return
    this.window.webContents.send(IPC_CHANNELS.AI_ANALYSIS_DONE, payload)
  }

  private attachPageTracker(tabId: string, webContents: WebContents, spaceId: SpaceId): void {
    const tracker = new PageVisitTracker(this.db, webContents, spaceId)
    this.pageTrackers.set(tabId, tracker)
  }

  private detachPageTracker(tabId: string): void {
    const tracker = this.pageTrackers.get(tabId)
    if (tracker) {
      tracker.destroy()
      this.pageTrackers.delete(tabId)
    }
  }

  getWindow(): BrowserWindow {
    return this.window
  }

  getActiveSpace(): SpaceId {
    return this.activeSpace
  }

  /** 供 IPC 层读取空间配置（db 为私有） */
  getSpacesFromDb(): Space[] {
    return getSpaces(this.db)
  }

  switchSpace(spaceId: SpaceId): { tabs: Tab[]; activeTabId: string | null } {
    if (spaceId === this.activeSpace) {
      const tm = this.tabManagers.get(spaceId)!
      return {
        tabs: tm.getAllTabs(),
        activeTabId: tm.getActiveTabId(),
      }
    }

    const prevManager = this.tabManagers.get(this.activeSpace)
    if (prevManager) {
      prevManager.hideAll()
    }

    this.activeSpace = spaceId
    const newManager = this.tabManagers.get(spaceId)!
    newManager.showActive()
    this.applyWebAreaBounds()

    return {
      tabs: newManager.getAllTabs(),
      activeTabId: newManager.getActiveTabId(),
    }
  }

  getTabManager(spaceId?: SpaceId): TabManager {
    const id = spaceId || this.activeSpace
    const tm = this.tabManagers.get(id)
    if (!tm) throw new Error(`No tab manager for space: ${id}`)
    return tm
  }

  /**
   * 按 tabId 找到它所属空间的标签管理器（跨空间操作用，如独立窗口里的导航）
   * 找不到返回 null，调用方自行决定降级策略。
   */
  getTabManagerForTab(tabId: string): TabManager | null {
    for (const tm of this.tabManagers.values()) {
      if (tm.hasTab(tabId)) return tm
    }
    return null
  }

  /**
   * 按 WebContents 反查标签 id
   *
   * 独立窗口（以及标签里的导航首页）发起的 IPC 请求（导航、新建标签、前进后退）
   * 必须作用在「发出请求的那个标签」上，而不是主窗口的当前标签——
   * 否则用户在独立窗口里点书签/搜索，页面会打开到主窗口去。
   */
  findTabIdByWebContents(wc: WebContents): string | null {
    for (const tm of this.tabManagers.values()) {
      const id = tm.findTabIdByWebContents(wc)
      if (id) return id
    }
    return null
  }

  /** 该 WebContents 显示在哪个窗口里（主窗口或某个独立窗口） */
  windowOfWebContents(wc: WebContents): BrowserWindow | null {
    const tabId = this.findTabIdByWebContents(wc)
    if (!tabId) return null
    const windowId = this.popout.windowIdOf(tabId)
    if (!windowId) return this.window
    return this.popout.windowOf(windowId) ?? this.window
  }

  getWebAreaBounds(): WebAreaBounds {
    return this.webAreaSynced ? { ...this.webArea } : this.fallbackBounds()
  }

  /**
   * 接收渲染进程实测的网页区矩形
   *
   * 只做合法性校验与边界收敛（防止把视图设成负数），不做任何布局推断：
   * 一旦主进程开始「帮忙算」，两边就会再次分叉。
   */
  setWebAreaBounds(bounds: Partial<WebAreaBounds>): void {
    const { x, y, width, height } = bounds || {}
    if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return
    }
    const [wWidth, wHeight] = this.window.getContentSize()
    this.webArea = {
      x: Math.max(0, Math.min(Math.round(x!), wWidth)),
      y: Math.max(0, Math.min(Math.round(y!), wHeight)),
      width: Math.max(0, Math.round(width!)),
      height: Math.max(0, Math.round(height!)),
    }
    this.webAreaSynced = true
    this.applyWebAreaBounds()
  }

  /** 切换全屏，返回切换后的状态 */
  async toggleFullscreen(): Promise<boolean> {
    const next = !this.window.isFullScreen()
    await this.window.setFullScreen(next)
    return next
  }

  /**
   * 主题切换后同步原生窗口控制按钮（titleBarOverlay）配色。
   * 运行时更新仅 Windows 支持；其它平台静默跳过（原生按钮由系统主题决定）。
   */
  applyThemeOverlay(mode: ThemeMode): void {
    if (process.platform !== 'win32') return
    if (this.window.isDestroyed() || typeof this.window.setTitleBarOverlay !== 'function') return
    // 深色与创建窗口时的初值一致；浅色对齐 Latte 的 --bg-mantle / --text
    const colors =
      mode === 'light'
        ? { color: '#e6e9ef', symbolColor: '#4c4f69' }
        : { color: '#181825', symbolColor: '#cdd6f4' }
    try {
      this.window.setTitleBarOverlay(colors)
    } catch (err) {
      console.error('[theme] 更新窗口控制按钮配色失败：', err)
    }
  }

  /** 记住当前主题并同步原生窗口控制按钮配色 */
  setTheme(mode: ThemeMode): void {
    this.theme = mode
    this.applyThemeOverlay(mode)
  }

  getTheme(): ThemeMode {
    return this.theme
  }

  /**
   * 向渲染进程推送最新的标签列表
   * 只推送当前活动空间；合并 50ms 内的多次变更，
   * 避免 SPA 站点频繁触发 did-navigate 时刷爆 IPC
   */
  private broadcastTabs(spaceId: SpaceId): void {
    // 任何标签变化都顺带排一次会话存档（增删/改名/跳转都算变化）
    this.scheduleSessionPersist()
    if (spaceId !== this.activeSpace) return
    if (this.tabsPushTimer) return

    this.tabsPushTimer = setTimeout(() => {
      this.tabsPushTimer = null
      this.flushTabs()
    }, 50)
  }

  private flushTabs(): void {
    if (this.window.isDestroyed()) return

    const tm = this.tabManagers.get(this.activeSpace)
    if (!tm) return

    this.window.webContents.send(IPC_CHANNELS.TABS_UPDATED, {
      tabs: tm.getAllTabs(),
      activeTabId: tm.getActiveTabId(),
    })
  }
}
