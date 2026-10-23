import { BrowserWindow, webContents } from 'electron'
import type { WebContents } from 'electron'
import type { Database } from 'sql.js'
import { getSetting, setSetting } from '../db/settings'
import { IPC_CHANNELS } from '@shared/ipc'

/**
 * 网页缩放管理（像浏览器一样）
 *
 * 说明：
 * - 按「站点 host」记忆缩放比例，下次打开同一站点自动沿用（存 settings 表）。
 * - 缩放只作用于当前网页标签；若在导航首页/无网页标签，则作用于应用界面本身（'__app__' 站点）。
 * - 比例变化后广播 zoom:changed，渲染端可提示当前百分比。
 */

const SETTING_KEY = 'zoom-levels'
const MIN_FACTOR = 0.5 // 50%
const MAX_FACTOR = 3 // 300%
const STEP = 0.1
const DEFAULT_FACTOR = 1
const APP_HOST = '__app__'

function clamp(v: number): number {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Math.round(v * 100) / 100))
}

export class ZoomManager {
  private levels = new Map<string, number>()

  constructor(private db: Database) {
    const raw = getSetting(db, SETTING_KEY)
    if (raw) {
      try {
        for (const [host, factor] of Object.entries(JSON.parse(raw) as Record<string, number>)) {
          this.levels.set(host, Number(factor) || DEFAULT_FACTOR)
        }
      } catch {
        /* 忽略损坏配置 */
      }
    }
  }

  private persist(): void {
    setSetting(this.db, SETTING_KEY, JSON.stringify(Object.fromEntries(this.levels)))
  }

  private hostOf(url: string | null | undefined): string {
    if (!url) return APP_HOST
    try {
      return new URL(url).host || APP_HOST
    } catch {
      return APP_HOST
    }
  }

  getFor(url: string | null | undefined): number {
    return this.levels.get(this.hostOf(url)) ?? DEFAULT_FACTOR
  }

  /** 导航完成后自动恢复该站点的缩放，并同步给渲染端（地址栏缩放控件显示） */
  apply(wc: WebContents | null, url: string | null | undefined): void {
    if (!wc || wc.isDestroyed()) return
    const factor = this.getFor(url)
    try {
      wc.setZoomFactor(factor)
      this.broadcast(factor)
    } catch (err) {
      console.error('[zoom] apply failed:', err)
    }
  }

  /**
   * 缩放当前内容。dir: 1 放大 / -1 缩小 / 0 重置
   * @returns 应用后的比例（100 = 100%），无法缩放时返回 null
   */
  step(wc: WebContents | null, url: string | null | undefined, dir: 1 | -1 | 0): number | null {
    if (!wc || wc.isDestroyed()) return null
    const host = this.hostOf(url)
    const current = this.levels.get(host) ?? DEFAULT_FACTOR
    const next = dir === 0 ? DEFAULT_FACTOR : clamp(current + dir * STEP)
    if (next === current && dir !== 0) return Math.round(current * 100)

    this.levels.set(host, next)
    this.persist()
    try {
      wc.setZoomFactor(next)
    } catch (err) {
      console.error('[zoom] setZoomFactor failed:', err)
      return null
    }
    this.broadcast(next)
    return Math.round(next * 100)
  }

  private broadcast(factor: number): void {
    const percent = Math.round(factor * 100)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.ZOOM_CHANGED, { factor, percent })
    }
  }
}

// 单例（tab-manager 在导航后需要恢复缩放）
let instance: ZoomManager | null = null

export function setZoomManager(mgr: ZoomManager): void {
  instance = mgr
}

export function getZoomManager(): ZoomManager | null {
  return instance
}

// ---------- 「当前内容」的目标选择（菜单快捷键 / 地址栏缩放控件共用） ----------

export interface ZoomTargetSource {
  getAllTabs(): { id: string; url: string }[]
  getWebContents(tabId: string): WebContents | null
  getActiveTabId(): string | null
  getShellWebContents(): WebContents | null
}

let targetSource: ZoomTargetSource | null = null

export function setZoomTargetSource(src: ZoomTargetSource | null): void {
  targetSource = src
}

/**
 * 对「当前内容」执行缩放。返回应用后的百分比。
 *
 * - `preferActiveTab: true`（地址栏控件 / 菜单 / 外壳快捷键）：只要存在活动网页标签
 *   就缩放该网页（与 Chrome 一致——即使焦点在浏览器界面上，Ctrl+= 缩的也是页面），
 *   没有网页标签时回落到焦点所在内容 / 应用界面。
 * - 默认（网页标签内快捷键场景其实不经过这里）：焦点优先 > 活动标签 > 应用界面。
 */
export function stepCurrentZoom(
  dir: 1 | -1 | 0,
  opts?: { preferActiveTab?: boolean }
): number | null {
  const zm = getZoomManager()
  if (!zm) return null

  if (opts?.preferActiveTab && targetSource) {
    const activeId = targetSource.getActiveTabId()
    const activeWc = activeId ? targetSource.getWebContents(activeId) : null
    if (activeWc) {
      const url = targetSource.getAllTabs().find((t) => t.id === activeId)?.url ?? null
      return zm.step(activeWc, url, dir)
    }
  }

  const focused = webContents.getFocusedWebContents?.() ?? null
  let target: WebContents | null = focused
  let url: string | null = null

  if (focused && targetSource) {
    for (const tab of targetSource.getAllTabs()) {
      if (targetSource.getWebContents(tab.id) === focused) {
        url = tab.url
        break
      }
    }
  }
  if (!target && targetSource) {
    const activeId = targetSource.getActiveTabId()
    const activeWc = activeId ? targetSource.getWebContents(activeId) : null
    if (activeWc) {
      target = activeWc
      url = targetSource.getAllTabs().find((t) => t.id === activeId)?.url ?? null
    }
  }
  if (!target) target = targetSource?.getShellWebContents() ?? null
  if (!target) return null

  return zm.step(target, url, dir)
}

/**
 * 给某个 webContents 挂上 Ctrl/Cmd + =/-/0 缩放快捷键。
 *
 * 为什么不用菜单 accelerator：菜单的 `CmdOrCtrl+Plus` 在不同平台/键盘布局下未必命中，
 * 而 before-input-event 是键盘事件本身，只要该页面有焦点就一定收到。
 */
export function attachZoomShortcuts(
  wc: WebContents,
  getUrl: () => string | null | undefined,
  opts?: { preferActiveTab?: boolean }
): void {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!input.control && !input.meta) return
    let dir: 1 | -1 | 0 | null = null
    if (input.key === '=' || input.key === '+' || input.key === 'numadd') dir = 1
    else if (input.key === '-' || input.key === 'numsub') dir = -1
    else if (input.key === '0') dir = 0
    if (dir === null) return

    event.preventDefault()
    if (opts?.preferActiveTab) stepCurrentZoom(dir, { preferActiveTab: true })
    else getZoomManager()?.step(wc, getUrl(), dir)
  })
}
