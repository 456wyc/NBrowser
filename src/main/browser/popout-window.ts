import { randomUUID } from 'crypto'
import { BrowserWindow, screen, type WebContents, type WebContentsView } from 'electron'
import type { Database } from 'sql.js'
import { IPC_CHANNELS, type PopoutTabInfo, type PopoutWindowInfo, type SpaceId } from '@shared/ipc'
import {
  boundsVisibleOnDisplay,
  buildPopoutHash,
  choosePopoutBounds,
  clampToDisplay,
  mergeSavedBounds,
  nearestDisplay,
  type Rectangle,
} from '@shared/popout-layout'
import type { SessionWindow } from '@shared/session-restore'
import { getSetting, setSetting } from '../db/settings'
import { loadRendererEntry } from './renderer-entry'

/**
 * 独立窗口管理（一个窗口可以承载多个标签，就像真正的浏览器窗口）
 *
 * 把标签的 WebContentsView 从主窗口摘下来、挂到一个新的 BrowserWindow 上，
 * 于是每一块屏幕都能显示不同页面（多屏盯盘/对照阅读）。
 *
 * 设计要点：
 * - 标签的所有权仍在各空间的 TabManager 里，这里只管「哪些标签摆在哪个窗口上」以及
 *   「窗口内哪个标签是活动的」；活动标签的视图挂在窗口上，其余视图只保留 WebContents
 *   （从 contentView 摘掉，页面不销毁、登录态与滚动位置都在）。
 * - 复用标签原有的 WebContentsView，不重建页面；窗口关掉后视图再挂回主窗口。
 * - 窗口位置按「光标所在显示器」落点，并按显示器分别记忆（存在 settings 里）；
 *   会话恢复时按窗口 id 把整组标签与位置一起还原回原来那块屏。
 * - 外壳（标签栏 + 地址栏 + 网页区占位）由渲染进程的 #/popout?win=<id> 路由渲染，
 *   网页区矩形由它实测上报（与主窗口同一套路：渲染进程实测，主进程照搬）。
 */

const BOUNDS_SETTING_KEY = 'popout.boundsByDisplay'
/** 外壳渲染进程还没上报矩形时的兜底：留给标签栏 + 地址栏的高度 */
const FALLBACK_TOOLBAR_HEIGHT = 68

export interface PopoutHost {
  /** 跨空间查找标签的基本信息 */
  findTab(tabId: string): { spaceId: SpaceId; title: string; url: string } | null
  /** 把标签从主窗口摘下来（不销毁），返回它的视图；不存在或已弹出返回 null */
  detachTab(tabId: string): WebContentsView | null
  /** 独立窗口关闭后把标签放回主窗口；makeActive 决定是否顺带激活它 */
  restoreTab(tabId: string, makeActive: boolean): void
  /** 独立窗口列表或标签列表变化（用于广播给渲染进程） */
  notifyChanged(): void
}

interface TabSlot {
  tabId: string
  view: WebContentsView
}

interface ListenerSet {
  wc: WebContents
  onTitle: (e: unknown, title: string) => void
  onNavigate: () => void
}

interface PopoutEntry {
  id: string
  win: BrowserWindow
  slots: TabSlot[]
  activeTabId: string
  /** 渲染进程实测的网页区矩形；未上报时按兜底工具栏高度算 */
  viewBounds: Rectangle | null
  listeners: Map<string, ListenerSet>
}

function resolvePreloadPath(): string | undefined {
  try {
    return require.resolve('../preload/index.js')
  } catch (err) {
    console.error('[popout] Failed to resolve preload path, running without preload:', err)
    return undefined
  }
}

const PRELOAD_PATH = resolvePreloadPath()

export class PopoutWindowManager {
  private entries: Map<string, PopoutEntry> = new Map()
  /** 正在被销毁（标签关闭 / 退出）的窗口：关闭时不要把标签塞回主窗口 */
  private discarding: Set<string> = new Set()
  private host: PopoutHost
  private db: Database

  constructor(host: PopoutHost, db: Database) {
    this.host = host
    this.db = db
  }

  // ---------- 查询 ----------

  /** 标签是否已经在某个独立窗口里 */
  has(tabId: string): boolean {
    return this.windowIdOf(tabId) !== null
  }

  /** 标签所在的独立窗口 id；不在窗口里返回 null */
  windowIdOf(tabId: string): string | null {
    for (const entry of this.entries.values()) {
      if (entry.slots.some((s) => s.tabId === tabId)) return entry.id
    }
    return null
  }

  /** 独立窗口数量（主窗口标签栏 🪟 N 显示的是这个） */
  count(): number {
    return this.entries.size
  }

  /** 每个独立窗口一条摘要（活动标签的标题 / 地址 + 窗口内标签数） */
  list(): PopoutWindowInfo[] {
    const out: PopoutWindowInfo[] = []
    for (const entry of this.entries.values()) {
      if (entry.win.isDestroyed()) continue
      const info = this.host.findTab(entry.activeTabId)
      out.push({
        windowId: entry.id,
        title: info?.title || '牛Browser',
        url: info?.url || '',
        tabCount: entry.slots.length,
      })
    }
    return out
  }

  /** 某个独立窗口内的标签列表（给窗口外壳渲染标签栏） */
  listTabs(windowId: string): { tabs: PopoutTabInfo[]; activeTabId: string } {
    const entry = this.entries.get(windowId)
    if (!entry) return { tabs: [], activeTabId: '' }
    return {
      tabs: entry.slots.map((s) => {
        const info = this.host.findTab(s.tabId)
        return {
          tabId: s.tabId,
          title: info?.title || '',
          url: info?.url || '',
          isActive: s.tabId === entry.activeTabId,
        }
      }),
      activeTabId: entry.activeTabId,
    }
  }

  /** 供会话存档快照：窗口位置 + 所在显示器 + 窗口内的整组标签 */
  snapshotWindows(): SessionWindow[] {
    const out: SessionWindow[] = []
    for (const entry of this.entries.values()) {
      if (entry.win.isDestroyed()) continue
      const b = entry.win.getBounds()
      out.push({
        id: entry.id,
        bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
        displayId: screen.getDisplayMatching(b).id,
        tabIds: entry.slots.map((s) => s.tabId),
        activeTabId: entry.activeTabId,
      })
    }
    return out
  }

  // ---------- 窗口操作 ----------

  /**
   * 把标签页弹出为新的独立窗口；已经在某个独立窗口里就唤醒那个窗口并切到它
   * @param restoreBounds 会话恢复时指定上次的窗口位置
   */
  open(tabId: string, restoreBounds?: Rectangle | null): { success: boolean; windowId?: string; error?: string } {
    const existing = this.windowIdOf(tabId)
    if (existing) {
      this.focusWindow(existing)
      this.switchTab(tabId)
      return { success: true, windowId: existing }
    }
    const info = this.host.findTab(tabId)
    if (!info) return { success: false, error: '标签不存在' }
    const view = this.host.detachTab(tabId)
    if (!view) return { success: false, error: '该标签无法弹出（可能已关闭）' }

    const windowId = `popout-${randomUUID().slice(0, 8)}`
    const win = this.createWindow(windowId, info.title, restoreBounds ?? null)
    const entry: PopoutEntry = {
      id: windowId,
      win,
      slots: [{ tabId, view }],
      activeTabId: tabId,
      viewBounds: null,
      listeners: new Map(),
    }
    this.entries.set(windowId, entry)
    this.attachTabListeners(entry, tabId, view.webContents)
    this.showTab(entry, tabId)
    this.host.notifyChanged()
    this.pushTabs(entry)
    return { success: true, windowId }
  }

  /**
   * 会话恢复：按上次的窗口 id / 标签顺序 / 活动标签重建一个独立窗口
   */
  restoreWindow(
    windowId: string,
    tabIds: string[],
    activeTabId: string,
    bounds: Rectangle | null
  ): { success: boolean; error?: string } {
    if (this.entries.has(windowId)) return { success: false, error: '窗口已存在' }
    const slots: TabSlot[] = []
    for (const tabId of tabIds) {
      const view = this.host.detachTab(tabId)
      if (!view) continue
      slots.push({ tabId, view })
    }
    if (slots.length === 0) return { success: false, error: '没有可恢复的标签' }

    const first = this.host.findTab(slots[0].tabId)
    const win = this.createWindow(windowId, first?.title || '牛Browser', bounds)
    const active = slots.some((s) => s.tabId === activeTabId) ? activeTabId : slots[0].tabId
    const entry: PopoutEntry = {
      id: windowId,
      win,
      slots,
      activeTabId: active,
      viewBounds: null,
      listeners: new Map(),
    }
    this.entries.set(windowId, entry)
    for (const slot of slots) {
      this.attachTabListeners(entry, slot.tabId, slot.view.webContents)
    }
    this.showTab(entry, active)
    this.host.notifyChanged()
    this.pushTabs(entry)
    return { success: true }
  }

  /**
   * 往已有独立窗口里加一个标签（窗口内新开页走这条，不再每个页面弹一个新 OS 窗口）
   */
  /**
   * @param makeActive 是否立即切到这一页（后台打开时不切）
   */
  addTabToWindow(windowId: string, tabId: string, makeActive = true): boolean {
    const entry = this.entries.get(windowId)
    if (!entry || entry.win.isDestroyed()) return false
    if (entry.slots.some((s) => s.tabId === tabId)) {
      if (makeActive) this.showTab(entry, tabId)
      return true
    }
    const view = this.host.detachTab(tabId)
    if (!view) return false
    entry.slots.push({ tabId, view })
    this.attachTabListeners(entry, tabId, view.webContents)
    if (makeActive) this.showTab(entry, tabId)
    this.host.notifyChanged()
    this.pushTabs(entry)
    return true
  }

  /** 窗口内切换标签 */
  switchTab(tabId: string): boolean {
    const entry = this.entryOfTab(tabId)
    if (!entry) return false
    if (entry.activeTabId === tabId) return true
    this.showTab(entry, tabId)
    this.host.notifyChanged()
    this.pushTabs(entry)
    return true
  }

  /**
   * 把窗口内的某一页单独送回主窗口标签栏（窗口保留其余页）
   *
   * 送回去后它在主窗口里是**活动标签**——用户明确把它挪回来，自然想立刻看到它。
   * 若这是窗口里最后一页，则等价于收回整个窗口。
   */
  returnTabToMain(tabId: string): boolean {
    const entry = this.entryOfTab(tabId)
    if (!entry) return false
    if (entry.slots.length <= 1) return this.closeWindow(entry.id)

    const idx = entry.slots.findIndex((s) => s.tabId === tabId)
    const slot = entry.slots[idx]
    entry.slots.splice(idx, 1)
    if (slot) {
      this.detachTabListeners(entry, slot.tabId)
      this.removeViewFromWindow(entry, slot.view)
    }
    if (entry.activeTabId === tabId) {
      const next = entry.slots[Math.min(idx, entry.slots.length - 1)]
      if (next) this.showTab(entry, next.tabId)
    }
    this.host.restoreTab(tabId, true)
    this.host.notifyChanged()
    this.pushTabs(entry)
    return true
  }

  /** 按 BrowserWindow 反查它是哪个独立窗口（Ctrl+T 要开在焦点所在的窗口里） */
  windowIdOfBrowserWindow(win: BrowserWindow | null): string | null {
    if (!win || win.isDestroyed()) return null
    for (const entry of this.entries.values()) {
      if (!entry.win.isDestroyed() && entry.win.id === win.id) return entry.id
    }
    return null
  }

  /** 取独立窗口本体（右键菜单要弹在它自己的窗口上，而不是弹回主窗口） */
  windowOf(windowId: string): BrowserWindow | null {
    const entry = this.entries.get(windowId)
    if (!entry || entry.win.isDestroyed()) return null
    return entry.win
  }

  /** 唤醒某个独立窗口（按窗口 id） */
  focusWindow(windowId: string): boolean {
    const entry = this.entries.get(windowId)
    if (!entry || entry.win.isDestroyed()) return false
    if (entry.win.isMinimized()) entry.win.restore()
    entry.win.focus()
    return true
  }

  /** 唤醒标签所在的独立窗口 */
  focus(tabId: string): boolean {
    const id = this.windowIdOf(tabId)
    return id ? this.focusWindow(id) : false
  }

  /** 收回：关掉标签所在的整个独立窗口，窗口内所有标签回到主窗口标签栏 */
  close(tabId: string): boolean {
    const id = this.windowIdOf(tabId)
    return id ? this.closeWindow(id) : false
  }

  /** 收回全部独立窗口，返回窗口数量 */
  closeAll(): number {
    const ids = Array.from(this.entries.keys())
    for (const id of ids) this.closeWindow(id)
    return ids.length
  }

  /**
   * 标签被销毁 / 空间被删除 / 退出应用：把它从窗口里摘掉，不塞回主窗口
   * 窗口空了就一并销毁，不留空壳
   */
  discard(tabId: string): void {
    const entry = this.entryOfTab(tabId)
    if (!entry) return
    const idx = entry.slots.findIndex((s) => s.tabId === tabId)
    const slot = entry.slots[idx]
    entry.slots.splice(idx, 1)
    if (slot) {
      this.detachTabListeners(entry, slot.tabId)
      this.removeViewFromWindow(entry, slot.view)
    }
    if (entry.slots.length === 0) {
      this.discarding.add(entry.id)
      this.entries.delete(entry.id)
      if (!entry.win.isDestroyed()) entry.win.destroy()
    } else if (entry.activeTabId === tabId) {
      const next = entry.slots[Math.min(idx, entry.slots.length - 1)]
      if (next) this.showTab(entry, next.tabId)
    }
    this.host.notifyChanged()
  }

  discardAll(): void {
    for (const id of Array.from(this.entries.keys())) {
      const entry = this.entries.get(id)
      if (!entry) continue
      this.discarding.add(id)
      for (const slot of entry.slots) {
        this.detachTabListeners(entry, slot.tabId)
        this.removeViewFromWindow(entry, slot.view)
      }
      this.entries.delete(id)
      if (!entry.win.isDestroyed()) entry.win.destroy()
    }
    this.host.notifyChanged()
  }

  /** 独立窗口外壳上报网页区矩形 */
  setViewBounds(windowId: string, bounds: Partial<Rectangle>): void {
    const entry = this.entries.get(windowId)
    if (!entry || entry.win.isDestroyed()) return
    const { x, y, width, height } = bounds || {}
    if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return
    const [wWidth, wHeight] = entry.win.getContentSize()
    entry.viewBounds = {
      x: Math.max(0, Math.min(Math.round(x!), wWidth)),
      y: Math.max(0, Math.min(Math.round(y!), wHeight)),
      width: Math.max(0, Math.round(width!)),
      height: Math.max(0, Math.round(height!)),
    }
    this.applyViewBounds(entry)
  }

  // ---------- 内部 ----------

  private entryOfTab(tabId: string): PopoutEntry | undefined {
    const id = this.windowIdOf(tabId)
    return id ? this.entries.get(id) : undefined
  }

  private closeWindow(windowId: string): boolean {
    const entry = this.entries.get(windowId)
    if (!entry || entry.win.isDestroyed()) return false
    entry.win.close()
    return true
  }

  /** 当前各显示器（纯数据，便于复用 @shared/popout-layout 的纯函数） */
  private displayInfos() {
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      workArea: {
        x: d.workArea.x,
        y: d.workArea.y,
        width: d.workArea.width,
        height: d.workArea.height,
      },
    }))
  }

  /**
   * 窗口落点：优先用会话恢复传进来的位置（若那块屏还在且仍看得见），
   * 否则走「光标所在显示器 + 该屏记忆位置」的常规逻辑
   */
  private resolveBounds(restore: Rectangle | null): Rectangle {
    const displays = this.displayInfos()
    if (restore && restore.width > 0 && restore.height > 0) {
      const center = { x: restore.x + restore.width / 2, y: restore.y + restore.height / 2 }
      const display = nearestDisplay(displays, center)
      if (display && boundsVisibleOnDisplay(restore, display)) {
        return clampToDisplay(restore, display)
      }
    }
    const cursor = screen.getCursorScreenPoint()
    return choosePopoutBounds(displays, { x: cursor.x, y: cursor.y }, this.loadSavedBounds())
  }

  private createWindow(windowId: string, title: string, restoreBounds: Rectangle | null): BrowserWindow {
    const bounds = this.resolveBounds(restoreBounds)
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 420,
      minHeight: 320,
      title: title || '牛Browser',
      backgroundColor: '#181825',
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    loadRendererEntry(win, buildPopoutHash(windowId))

    win.on('resize', () => {
      const entry = this.entries.get(windowId)
      if (entry) this.applyViewBounds(entry)
    })

    // 关闭前记住位置（按显示器分别记忆，下次在这块屏上弹出就复用）
    win.on('close', () => {
      this.persistBounds(win)
    })
    win.on('closed', () => {
      const entry = this.entries.get(windowId)
      const discard = this.discarding.delete(windowId)
      if (entry) {
        for (const slot of entry.slots) {
          this.detachTabListeners(entry, slot.tabId)
          this.removeViewFromWindow(entry, slot.view)
          // 逐个放回主窗口；窗口内当时活动的那个标签回到主窗口后也激活
          if (!discard) {
            this.host.restoreTab(slot.tabId, slot.tabId === entry.activeTabId)
          }
        }
      }
      this.entries.delete(windowId)
      this.host.notifyChanged()
    })

    return win
  }

  /** 把某个标签显示为窗口的活动页：其余视图只摘掉不销毁 */
  private showTab(entry: PopoutEntry, tabId: string): void {
    const slot = entry.slots.find((s) => s.tabId === tabId)
    if (!slot) return
    for (const other of entry.slots) {
      if (other.tabId !== tabId) this.removeViewFromWindow(entry, other.view)
    }
    try {
      if (!entry.win.contentView.children.includes(slot.view)) {
        entry.win.contentView.addChildView(slot.view)
      }
    } catch (err) {
      console.error('[popout] addChildView failed:', err)
    }
    entry.activeTabId = tabId
    this.applyViewBounds(entry)
    const info = this.host.findTab(tabId)
    entry.win.setTitle(info?.title || '牛Browser')
  }

  private removeViewFromWindow(entry: PopoutEntry, view: WebContentsView): void {
    try {
      if (!entry.win.isDestroyed() && entry.win.contentView.children.includes(view)) {
        entry.win.contentView.removeChildView(view)
      }
    } catch (err) {
      console.error('[popout] removeChildView failed:', err)
    }
  }

  private attachTabListeners(entry: PopoutEntry, tabId: string, wc: WebContents): void {
    const onTitle = (_e: unknown, nextTitle: string) => {
      if (!this.entries.has(entry.id)) return
      if (entry.activeTabId === tabId) entry.win.setTitle(nextTitle || '牛Browser')
      this.host.notifyChanged()
      this.pushTabs(entry)
    }
    const onNavigate = () => {
      if (!this.entries.has(entry.id)) return
      this.host.notifyChanged()
      this.pushTabs(entry)
    }
    wc.on('page-title-updated', onTitle)
    wc.on('did-navigate', onNavigate)
    wc.on('did-navigate-in-page', onNavigate)
    entry.listeners.set(tabId, { wc, onTitle, onNavigate })
  }

  private detachTabListeners(entry: PopoutEntry, tabId: string): void {
    const set = entry.listeners.get(tabId)
    if (!set) return
    try {
      set.wc.removeListener('page-title-updated', set.onTitle)
      set.wc.removeListener('did-navigate', set.onNavigate)
      set.wc.removeListener('did-navigate-in-page', set.onNavigate)
    } catch {
      // webContents 已销毁时移除无意义，忽略
    }
    entry.listeners.delete(tabId)
  }

  /** 把该窗口的标签列表推给窗口自己的外壳 */
  private pushTabs(entry: PopoutEntry): void {
    try {
      if (entry.win.isDestroyed()) return
      entry.win.webContents.send(IPC_CHANNELS.WINDOWS_TABS_UPDATED, this.listTabs(entry.id))
    } catch {
      // 外壳还没加载完，忽略（它挂载后会主动拉一次）
    }
  }

  private applyViewBounds(entry: PopoutEntry): void {
    if (entry.win.isDestroyed()) return
    const slot = entry.slots.find((s) => s.tabId === entry.activeTabId)
    if (!slot) return
    const [w, h] = entry.win.getContentSize()
    const b = entry.viewBounds ?? {
      x: 0,
      y: FALLBACK_TOOLBAR_HEIGHT,
      width: w,
      height: Math.max(0, h - FALLBACK_TOOLBAR_HEIGHT),
    }
    try {
      slot.view.setBounds({
        x: Math.max(0, Math.round(b.x)),
        y: Math.max(0, Math.round(b.y)),
        width: Math.max(0, Math.round(b.width)),
        height: Math.max(0, Math.round(b.height)),
      })
    } catch (err) {
      console.error('[popout] setBounds failed:', err)
    }
  }

  private loadSavedBounds(): Record<string, Rectangle> {
    try {
      const raw = getSetting(this.db, BOUNDS_SETTING_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return {}
      return parsed as Record<string, Rectangle>
    } catch {
      return {}
    }
  }

  private persistBounds(win: BrowserWindow): void {
    try {
      if (win.isDestroyed()) return
      const bounds = win.getBounds()
      const display = screen.getDisplayMatching(bounds)
      const saved = this.loadSavedBounds()
      setSetting(
        this.db,
        BOUNDS_SETTING_KEY,
        JSON.stringify(mergeSavedBounds(saved, display.id, bounds))
      )
    } catch (err) {
      console.error('[popout] persist bounds failed:', err)
    }
  }
}
