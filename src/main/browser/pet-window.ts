import { BrowserWindow, screen } from 'electron'
import type { Database } from 'sql.js'
import { getSetting, setSetting } from '../db/settings'
import { loadRendererEntry } from './renderer-entry'

/**
 * AI 桌宠窗口
 *
 * 一个独立的小型桌面浮窗：透明、无边框、始终置顶、不进任务栏，永远浮在其它窗口之上，
 * 所以你能一边看行情/逛网页一边和它说话。
 *
 * 要点：
 * - 复用渲染进程的 `#/pet` 路由（与 `#/nav`、`#/popout` 同一套 hash 路由），不新增构建入口；
 * - 位置按显示器记忆在 settings 里（与独立窗口同一套路）；
 * - 聊天面板开合时由桌宠自己调 PET_SET_SIZE 改窗口尺寸，
 *   因为渲染进程改不了自己的 OS 窗口大小。
 */

const BOUNDS_SETTING_KEY = 'pet.bounds'
/** 收起态（只有桌宠本体）的尺寸 */
const COMPACT_SIZE = { width: 176, height: 190 }
/** 展开聊天时的尺寸 */
const CHAT_SIZE = { width: 320, height: 460 }

function resolvePreloadPath(): string | undefined {
  try {
    return require.resolve('../preload/index.js')
  } catch (err) {
    console.error('[pet] Failed to resolve preload path, running without preload:', err)
    return undefined
  }
}

const PRELOAD_PATH = resolvePreloadPath()

interface PetBounds {
  x: number
  y: number
}

let petWindow: BrowserWindow | null = null
let petDb: Database | null = null

function loadBounds(): PetBounds | null {
  if (!petDb) return null
  try {
    const raw = getSetting(petDb, BOUNDS_SETTING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Record<string, PetBounds>>
    // 按显示器分别记忆，找不到就退回默认位置
    const display = screen.getPrimaryDisplay()
    const saved = parsed && typeof parsed === 'object' ? parsed[String(display.id)] : null
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
  } catch {
    /* 解析失败则用默认位置 */
  }
  return null
}

function saveBounds(b: PetBounds): void {
  if (!petDb) return
  try {
    const display = screen.getDisplayMatching({ ...b, width: COMPACT_SIZE.width, height: COMPACT_SIZE.height })
    let all: Record<string, PetBounds> = {}
    const raw = getSetting(petDb, BOUNDS_SETTING_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') all = parsed as Record<string, PetBounds>
      } catch {
        all = {}
      }
    }
    all[String(display.id)] = { x: b.x, y: b.y }
    setSetting(petDb, BOUNDS_SETTING_KEY, JSON.stringify(all))
  } catch {
    /* 记不住位置不影响使用 */
  }
}

function defaultBounds(): PetBounds {
  const wa = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(wa.x + wa.width - COMPACT_SIZE.width - 24),
    y: Math.round(wa.y + wa.height - COMPACT_SIZE.height - 24),
  }
}

/** 创建（或复活）桌宠窗口 */
export function createPetWindow(db: Database): void {
  petDb = db
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show()
    return
  }

  const saved = loadBounds()
  const pos = saved ?? defaultBounds()

  petWindow = new BrowserWindow({
    width: COMPACT_SIZE.width,
    height: COMPACT_SIZE.height,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    // 透明窗口必须显式给全透明背景色，否则 Windows 下会糊一层白/黑底
    backgroundColor: '#00000000',
    title: '牛来',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 始终置顶：screen-saver 级别高于普通窗口，桌宠才不会被应用主窗口盖住
  petWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRendererEntry(petWindow, '/pet')
  console.log('[main] Pet window created')

  const persist = () => {
    if (!petWindow || petWindow.isDestroyed()) return
    const b = petWindow.getBounds()
    saveBounds({ x: b.x, y: b.y })
  }
  petWindow.on('moved', persist)
  petWindow.on('closed', () => {
    petWindow = null
  })

  // 右键：给一个最小的操作菜单（不用把桌宠塞进应用菜单也能收起）
  petWindow.webContents.on('context-menu', (_e, _p) => {
    /* 由渲染进程的 HTML 事件处理（透明窗口里原生菜单不便定位） */
  })
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow && !petWindow.isDestroyed() ? petWindow : null
}

export function isPetVisible(): boolean {
  const w = getPetWindow()
  return !!w && w.isVisible()
}

/** 显示/隐藏；不传 visible 则切换。返回操作后的可见状态 */
export function togglePetWindow(visible?: boolean): boolean {
  const w = getPetWindow()
  if (!w) return false
  const next = visible ?? !w.isVisible()
  if (next) w.show()
  else w.hide()
  return next
}

/** 桌宠开合聊天面板时调整窗口尺寸（宽高都做了上下限，避免被异常值撑爆） */
export function setPetSize(width: number, height: number): boolean {
  const w = getPetWindow()
  if (!w) return false
  const nw = Math.min(Math.max(Math.round(width), COMPACT_SIZE.width), CHAT_SIZE.width)
  const nh = Math.min(Math.max(Math.round(height), COMPACT_SIZE.height), CHAT_SIZE.height + 120)
  w.setSize(nw, nh)
  return true
}

/** 主窗口关闭 / 退出时收掉桌宠，避免它变成没有主窗口的孤儿浮窗 */
export function destroyPetWindow(): void {
  const w = getPetWindow()
  if (!w) return
  if (!w.isDestroyed()) w.destroy()
  petWindow = null
}

export const PET_SIZES = { compact: COMPACT_SIZE, chat: CHAT_SIZE }
