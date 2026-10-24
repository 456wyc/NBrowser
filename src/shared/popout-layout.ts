/**
 * 独立窗口（把标签页弹出为独立 OS 窗口）的布局计算 —— 纯函数，可单测
 *
 * 多屏诉求：用户希望不同屏幕显示不同内容，因此新窗口要「在哪块屏幕上操作，
 * 就弹到哪块屏幕上」，并且同一块屏幕上再次弹出时复用上次的位置与大小
 * （记住显示器，而不是记住全局唯一的一份坐标）。
 */

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface DisplayInfo {
  /** Electron Display.id */
  id: number
  /** 可用区域（不含任务栏 / 菜单栏） */
  workArea: Rectangle
}

/** 新窗口默认尺寸（宽屏内容足够，又不至于盖满小屏） */
export const DEFAULT_POPOUT_SIZE = { width: 1100, height: 760 }
/** 屏幕边缘留白，避免窗口紧贴工作区边界 */
export const SCREEN_MARGIN = 24
/** 已保存位置仍算「在这块屏幕上」的最小可见比例 */
const MIN_VISIBLE_RATIO = 0.35

function area(r: Rectangle): number {
  return Math.max(0, r.width) * Math.max(0, r.height)
}

function intersection(a: Rectangle, b: Rectangle): Rectangle {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

/** 点到矩形的距离（矩形内为 0） */
export function distanceToRect(p: Point, r: Rectangle): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
  return Math.hypot(dx, dy)
}

/** 光标（或任意点）最近的显示器 */
export function nearestDisplay(displays: DisplayInfo[], point: Point): DisplayInfo | null {
  if (!displays || displays.length === 0) return null
  let best = displays[0]
  let bestDist = distanceToRect(point, best.workArea)
  for (const d of displays.slice(1)) {
    const dist = distanceToRect(point, d.workArea)
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  return best
}

/** 默认矩形：在显示器可用区里居中，尺寸不超过可用区 */
export function defaultPopoutBounds(
  display: DisplayInfo,
  size: { width: number; height: number } = DEFAULT_POPOUT_SIZE
): Rectangle {
  const w = Math.max(1, Math.min(size.width, display.workArea.width - SCREEN_MARGIN * 2))
  const h = Math.max(1, Math.min(size.height, display.workArea.height - SCREEN_MARGIN * 2))
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - w) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  }
}

/** 保持尺寸，把矩形挪进显示器可用区（比可用区大时优先保住左上角） */
export function clampToDisplay(bounds: Rectangle, display: DisplayInfo): Rectangle {
  const wa = display.workArea
  const width = Math.min(bounds.width, wa.width)
  const height = Math.min(bounds.height, wa.height)
  const maxX = wa.x + wa.width - width
  const maxY = wa.y + wa.height - height
  return {
    x: Math.round(Math.min(Math.max(bounds.x, wa.x), Math.max(wa.x, maxX))),
    y: Math.round(Math.min(Math.max(bounds.y, wa.y), Math.max(wa.y, maxY))),
    width: Math.round(width),
    height: Math.round(height),
  }
}

/** 已保存的矩形在该显示器上是否还看得见（换屏 / 拔显示器后旧坐标会落到屏幕外） */
export function boundsVisibleOnDisplay(
  bounds: Rectangle,
  display: DisplayInfo,
  minRatio = MIN_VISIBLE_RATIO
): boolean {
  if (area(bounds) <= 0) return false
  return area(intersection(bounds, display.workArea)) / area(bounds) >= minRatio
}

/**
 * 决定新独立窗口的初始位置
 * - 落在光标所在的显示器上（多屏时「在哪操作就弹到哪」）
 * - 该显示器上记住过位置且仍可见 -> 复用（用户拖过的位置被尊重）
 * - 否则居中默认尺寸
 */
export function choosePopoutBounds(
  displays: DisplayInfo[],
  cursor: Point,
  saved?: Record<string, Rectangle>
): Rectangle {
  const display = nearestDisplay(displays, cursor)
  if (!display) {
    return { x: 100, y: 100, width: DEFAULT_POPOUT_SIZE.width, height: DEFAULT_POPOUT_SIZE.height }
  }
  const remembered = saved?.[String(display.id)]
  if (remembered && remembered.width > 0 && remembered.height > 0) {
    if (boundsVisibleOnDisplay(remembered, display)) return clampToDisplay(remembered, display)
  }
  return defaultPopoutBounds(display)
}

/** 把「某显示器上最后一次的窗口位置」合并进存档（按显示器分别记忆） */
export function mergeSavedBounds(
  saved: Record<string, Rectangle> | undefined,
  displayId: number,
  bounds: Rectangle,
  limit = 8
): Record<string, Rectangle> {
  const next: Record<string, Rectangle> = { ...(saved || {}) }
  next[String(displayId)] = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
  const keys = Object.keys(next)
  if (keys.length > limit) {
    // 超出上限就丢掉最早写入的（Object.keys 保持插入顺序）
    for (const k of keys.slice(0, keys.length - limit)) delete next[k]
  }
  return next
}

/**
 * 解析独立窗口外壳的 hash：#/popout?win=<windowId>
 * 主进程用同样的规则拼 URL，渲染进程用同样的规则解析，避免两边各写一份。
 */
export function parsePopoutHash(hash: string): string | null {
  const raw = (hash || '').replace(/^#/, '')
  if (!raw.startsWith('/popout')) return null
  const qIndex = raw.indexOf('?')
  if (qIndex < 0) return null
  const params = new URLSearchParams(raw.slice(qIndex + 1))
  const windowId = params.get('win')
  return windowId && windowId.trim() ? windowId.trim() : null
}

/** 构造独立窗口外壳的 hash（与 parsePopoutHash 互为逆运算） */
export function buildPopoutHash(windowId: string): string {
  return `/popout?win=${encodeURIComponent(windowId)}`
}
