import { WebContentsView, session, type BrowserWindow, type WebContents } from 'electron'
import { getZoomManager, attachZoomShortcuts } from './zoom-manager'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import type { Tab, SpaceId } from '@shared/ipc'
import { getSpacePartition } from './space-manager'
import { extractStockFromUrl } from '../stock-extractor'
import { toNavigableUrl } from '@shared/url'

export interface TabInternal {
  id: string
  spaceId: SpaceId
  view: WebContentsView
  title: string
  url: string
  isActive: boolean
}

export interface TabManagerHooks {
  onTabCreated?: (tabId: string, webContents: WebContents, spaceId: SpaceId) => void
  onTabClosed?: (tabId: string) => void
  // 标签列表发生变化（标题/URL/增删/切换），用于向渲染进程推送最新状态
  onTabsChanged?: (spaceId: SpaceId) => void
}

export interface TabManagerOptions {
  hooks?: TabManagerHooks
  /** 默认搜索引擎模板提供器（设置里可改；%s 为搜索词占位符） */
  searchTemplateProvider?: () => string
}

function resolvePreloadPath(): string | undefined {
  try {
    return require.resolve('../preload/index.js')
  } catch (err) {
    // 解析失败时降级为不注入，避免「创建标签直接抛错 -> 主窗口起不来」
    console.error('[tab] Failed to resolve preload path, running without preload:', err)
    return undefined
  }
}

const PRELOAD_PATH = resolvePreloadPath()

export class TabManager {
  private tabs: Map<string, TabInternal> = new Map()
  private activeTabId: string | null = null
  private spaceId: SpaceId
  private mainWindow: BrowserWindow
  private webAreaBounds = { x: 0, y: 0, width: 0, height: 0 }
  private hooks: TabManagerHooks
  private searchTemplateProvider?: () => string

  constructor(mainWindow: BrowserWindow, spaceId: SpaceId, options: TabManagerOptions = {}) {
    this.mainWindow = mainWindow
    this.spaceId = spaceId
    this.hooks = options.hooks ?? {}
    this.searchTemplateProvider = options.searchTemplateProvider
  }

  /**
   * 创建新标签
   */
  createTab(url?: string, active = true): Tab {
    const id = randomUUID()
    const partition = getSpacePartition(this.spaceId)

    const view = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // 注入 preload，让本机页面（如导航首页）也能调用 IPC。
        // preload 内部会校验页面来源，外部网站不会被暴露任何 API。
        preload: PRELOAD_PATH,
      },
    })

    const initialUrl = url || this.getNavHomeUrl()
    view.webContents.loadURL(initialUrl)

    // 链接点击（target="_blank" / window.open）统一在本应用内以标签打开，
    // 而不是 Electron 默认弹出原生窗口。后台打开（disposition=background-tab）保持当前标签。
    view.webContents.setWindowOpenHandler(({ url: popupUrl, disposition }) => {
      const openActive = disposition !== 'background-tab'
      this.createTab(popupUrl, openActive)
      return { action: 'deny' }
    })

    const tabInternal: TabInternal = {
      id,
      spaceId: this.spaceId,
      view,
      title: initialUrl,
      url: initialUrl,
      isActive: false,
    }

    // 监听标题和 URL 变化
    view.webContents.on('page-title-updated', (_event, title) => {
      tabInternal.title = title
      this.notifyTabsChanged()
    })
    view.webContents.on('did-navigate', (_event, newUrl) => {
      tabInternal.url = newUrl
      // 恢复该站点记忆的缩放比例（新标签默认 100%）
      getZoomManager()?.apply(view.webContents, newUrl)
      this.notifyTabsChanged()
    })
    view.webContents.on('did-navigate-in-page', (_event, newUrl) => {
      tabInternal.url = newUrl
      this.notifyTabsChanged()
    })
    view.webContents.on('page-favicon-updated', () => this.notifyTabsChanged())

    // Ctrl+滚轮 / 触控板捏合缩放：接管后统一走 ZoomManager，比例也会被站点记忆
    view.webContents.on('zoom-changed', (_event, zoomDirection: 'in' | 'out') => {
      getZoomManager()?.step(view.webContents, tabInternal.url, zoomDirection === 'in' ? 1 : -1)
    })

    // Ctrl/Cmd + = / - / 0 缩放当前网页
    attachZoomShortcuts(view.webContents, () => tabInternal.url)

    this.tabs.set(id, tabInternal)

    // 触发钩子
    if (this.hooks.onTabCreated) {
      this.hooks.onTabCreated(id, view.webContents, this.spaceId)
    }

    if (active) {
      this.switchTab(id)
    }

    this.notifyTabsChanged()
    return this.toPublicTab(tabInternal)
  }

  private notifyTabsChanged(): void {
    if (this.hooks.onTabsChanged) {
      this.hooks.onTabsChanged(this.spaceId)
    }
  }

  /**
   * 关闭标签
   */
  closeTab(tabId: string): { success: boolean; activeTabId: string | null } {
    const tab = this.tabs.get(tabId)
    if (!tab) return { success: false, activeTabId: this.activeTabId }

    const wasActive = tab.isActive

    // 从窗口移除
    if (this.mainWindow.contentView.children.includes(tab.view)) {
      this.mainWindow.contentView.removeChildView(tab.view)
    }
    // 销毁 WebContents
    const wc = tab.view.webContents
    if (!wc.isDestroyed()) {
      wc.close()
    }
    this.tabs.delete(tabId)

    // 触发钩子
    if (this.hooks.onTabClosed) {
      this.hooks.onTabClosed(tabId)
    }

    if (wasActive) {
      // 关闭的是活动标签，切换到下一个
      const remaining = this.getTabsOrdered()
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1].id)
      } else {
        // 最后一个标签关闭了，自动新建一个空白导航页
        this.createTab()
      }
    }

    this.notifyTabsChanged()
    return { success: true, activeTabId: this.activeTabId }
  }

  /**
   * 切换活动标签
   */
  switchTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    if (!tab) return false

    // 隐藏当前活动标签
    if (this.activeTabId && this.activeTabId !== tabId) {
      const prevTab = this.tabs.get(this.activeTabId)
      if (prevTab) {
        prevTab.isActive = false
        if (this.mainWindow.contentView.children.includes(prevTab.view)) {
          this.mainWindow.contentView.removeChildView(prevTab.view)
        }
      }
    }

    // 显示新标签
    tab.isActive = true
    this.activeTabId = tabId
    if (!this.mainWindow.contentView.children.includes(tab.view)) {
      this.mainWindow.contentView.addChildView(tab.view)
    }
    this.updateActiveViewBounds()

    this.notifyTabsChanged()
    return true
  }

  /**
   * 刷新活动标签（或指定标签）
   */
  reloadTab(tabId?: string): boolean {
    const id = tabId || this.activeTabId
    if (!id) return false
    const tab = this.tabs.get(id)
    if (!tab) return false
    tab.view.webContents.reload()
    return true
  }

  goBack(tabId?: string): boolean {
    const id = tabId || this.activeTabId
    if (!id) return false
    const tab = this.tabs.get(id)
    if (!tab || !tab.view.webContents.canGoBack()) return false
    tab.view.webContents.goBack()
    return true
  }

  goForward(tabId?: string): boolean {
    const id = tabId || this.activeTabId
    if (!id) return false
    const tab = this.tabs.get(id)
    if (!tab || !tab.view.webContents.canGoForward()) return false
    tab.view.webContents.goForward()
    return true
  }

  navigate(url: string, tabId?: string): boolean {
    const id = tabId || this.activeTabId
    if (!id) return false
    const tab = this.tabs.get(id)
    if (!tab) return false

    const finalUrl = this.normalizeUrl(url)
    tab.view.webContents.loadURL(finalUrl)
    return true
  }

  /**
   * 关闭除指定标签外的所有标签
   */
  closeOtherTabs(keepTabId: string): void {
    for (const tab of Array.from(this.tabs.values())) {
      if (tab.id !== keepTabId) {
        this.destroyTab(tab.id)
      }
    }
    this.notifyTabsChanged()
  }

  /**
   * 关闭指定标签右侧的所有标签
   */
  closeTabsToTheRight(tabId: string): void {
    const ids = this.getTabsOrdered().map((t) => t.id)
    const index = ids.indexOf(tabId)
    if (index < 0) return

    for (const id of ids.slice(index + 1)) {
      this.destroyTab(id)
    }
    this.notifyTabsChanged()
  }

  /**
   * 销毁标签但不触发「关掉最后一个就自动新建」的逻辑
   */
  private destroyTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const wasActive = tab.isActive

    if (this.mainWindow.contentView.children.includes(tab.view)) {
      this.mainWindow.contentView.removeChildView(tab.view)
    }
    const wc = tab.view.webContents
    if (!wc.isDestroyed()) {
      wc.close()
    }
    this.tabs.delete(tabId)

    if (this.hooks.onTabClosed) {
      this.hooks.onTabClosed(tabId)
    }

    if (wasActive) {
      const remaining = this.getTabsOrdered()
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1].id)
      }
    }
  }

  /**
   * 按给定顺序重排标签（拖拽排序用）
   * ids 应为当前全部标签 id 的新顺序；缺失的 id 保持原有相对顺序追加在末尾
   */
  reorderTabs(ids: string[]): boolean {
    const known = ids.filter((id) => this.tabs.has(id))
    const rest = Array.from(this.tabs.keys()).filter((id) => !known.includes(id))

    const next = new Map<string, TabInternal>()
    for (const id of [...known, ...rest]) {
      next.set(id, this.tabs.get(id)!)
    }

    if (next.size !== this.tabs.size) return false
    this.tabs = next
    this.notifyTabsChanged()
    return true
  }

  getAllTabs(): Tab[] {
    return this.getTabsOrdered().map((t) => this.toPublicTab(t))
  }

  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null
    const tab = this.tabs.get(this.activeTabId)
    return tab ? this.toPublicTab(tab) : null
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  /**
   * 获取标签底层的 WebContents（供主进程注入脚本、抓取正文用）
   */
  getWebContents(tabId?: string): WebContents | null {
    const id = tabId || this.activeTabId
    if (!id) return null
    const tab = this.tabs.get(id)
    if (!tab || tab.view.webContents.isDestroyed()) return null
    return tab.view.webContents
  }

  /**
   * 更新网页区域的 bounds（窗口大小改变时调用）
   */
  setWebAreaBounds(x: number, y: number, width: number, height: number): void {
    this.webAreaBounds = { x, y, width, height }
    this.updateActiveViewBounds()
  }

  private updateActiveViewBounds(): void {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return
    tab.view.setBounds(this.webAreaBounds)
  }

  private getTabsOrdered(): TabInternal[] {
    // 按创建顺序（Map 的插入顺序）
    return Array.from(this.tabs.values())
  }

  private toPublicTab(internal: TabInternal): Tab {
    return {
      id: internal.id,
      spaceId: internal.spaceId,
      title: internal.title,
      url: internal.url,
      isActive: internal.isActive,
      canGoBack: internal.view.webContents.canGoBack(),
      canGoForward: internal.view.webContents.canGoForward(),
      symbol: extractStockFromUrl(internal.url),
    }
  }

  private normalizeUrl(input: string): string {
    // 统一走 shared 的实现，避免主进程与渲染端各写一份导致行为不一致；
    // 搜索词按设置里的默认搜索引擎模板转换
    const template = this.searchTemplateProvider?.() ?? undefined
    return toNavigableUrl(input, template) || this.getNavHomeUrl()
  }

  private getNavHomeUrl(): string {
    // 导航首页使用渲染进程的本地页面（hash 路由，只渲染内容不带外壳）
    if (process.env.ELECTRON_RENDERER_URL) {
      return `${process.env.ELECTRON_RENDERER_URL}/#/nav`
    }
    // 生产模式：加载打包后的渲染进程页面。
    // 主进程始终从 out/main/index.js 运行，渲染进程页面位于 out/renderer/index.html；
    // 打包进 app.asar 后路径又会不同，因此按候选路径依次探测，
    // 全部失败才降级为占位页（并打印明确日志，方便排障）。
    const candidates: string[] = [
      join(__dirname, '../renderer/index.html'),
      join(__dirname, '../../renderer/index.html'),
      join(process.resourcesPath ?? '', 'app.asar/out/renderer/index.html'),
    ]
    for (const candidate of candidates) {
      try {
        if (candidate && existsSync(candidate)) {
          return `${pathToFileURL(candidate).href}#/nav`
        }
      } catch {
        // 该候选不可用，继续尝试下一个
      }
    }
    console.error(
      '[tab] 未定位到渲染进程页面 renderer/index.html，导航首页降级为占位页。已尝试：',
      candidates
    )
    return 'data:text/html,<h1>导航首页</h1>'
  }

  /**
   * 销毁所有标签
   */
  destroyAll(): void {
    for (const tab of this.tabs.values()) {
      if (this.mainWindow.contentView.children.includes(tab.view)) {
        this.mainWindow.contentView.removeChildView(tab.view)
      }
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close()
      }
    }
    this.tabs.clear()
    this.activeTabId = null
  }

  /**
   * 隐藏所有标签（切换空间时）
   * 与 destroyAll 不同，只是从窗口移除但不销毁。
   * 注意：保留 activeTabId——切走时若清空，切回时 showActive 会误判
   * 「没有活动标签」而新建空标签（每次切换空间多一个标签的根因）。
   */
  hideAll(): void {
    for (const tab of this.tabs.values()) {
      if (this.mainWindow.contentView.children.includes(tab.view)) {
        this.mainWindow.contentView.removeChildView(tab.view)
      }
      tab.isActive = false
    }
  }

  /**
   * 显示活动标签（切换到该空间时）
   */
  showActive(): void {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
    if (!tab) {
      // 活动标签不存在（空空间 / 遗留脏 ID）：有标签则激活最后一个，否则新建导航页
      const remaining = this.getTabsOrdered()
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1].id)
      } else {
        this.createTab()
      }
      return
    }
    if (!this.mainWindow.contentView.children.includes(tab.view)) {
      this.mainWindow.contentView.addChildView(tab.view)
      tab.isActive = true
      this.updateActiveViewBounds()
    }
  }
}
