import type { Rectangle } from './popout-layout'

/**
 * 会话恢复（重启后还原上次的标签页与独立窗口）——纯函数，可单测
 *
 * 背景：标签页此前只活在内存里，一重启就全没了；独立窗口更是要重新一个个弹出、拖回原来的屏幕。
 * 多屏用户的诉求是「每块屏幕放不同的内容」，所以恢复的不只是标签，还有**哪个窗口在哪块屏幕上**。
 *
 * 持久化的是「最小可恢复集」：标签的 url / 所属空间 / 是否活动 / 是否弹出，以及独立窗口的位置。
 * 页面内的 JS 状态（滚动位置、未提交的表单）不恢复——那需要重建 WebContents 才能做到，
 * 这里只保证「打开的东西还在、摆的位置还在」。
 */

export interface SessionTab {
  id: string
  spaceId: string
  url: string
  title: string
  isActive: boolean
  poppedOut: boolean
  /** 该标签被弹到哪个独立窗口（没有则为主窗口内的普通标签） */
  windowId?: string
}

export interface SessionWindow {
  /** 独立窗口 id（形如 popout-xxxxxxxx），重启后沿用，窗口内标签靠它归组 */
  id: string
  /** 窗口矩形（屏幕坐标） */
  bounds: Rectangle
  /** 该窗口上次所在的显示器，用于校验坐标是否还有效 */
  displayId: number
  /** 窗口内的标签顺序（即窗口标签栏顺序） */
  tabIds: string[]
  /** 窗口内当时活动的标签 */
  activeTabId: string
}

export interface BrowserSession {
  tabs: SessionTab[]
  windows: SessionWindow[]
}

/** 单个空间最多恢复多少标签（防止异常存档一次开几十个） */
export const MAX_RESTORE_TABS_PER_SPACE = 20
/** 最多恢复多少个独立窗口（一次弹一堆窗口比不恢复更糟） */
export const MAX_RESTORE_WINDOWS = 6

export function emptySession(): BrowserSession {
  return { tabs: [], windows: [] }
}

function isRect(v: unknown): v is Rectangle {
  const r = v as Rectangle
  return (
    !!r &&
    [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function pickTab(raw: unknown, spaceIds: string[]): SessionTab | null {
  const t = raw as SessionTab
  if (!t || typeof t !== 'object') return null
  if (typeof t.id !== 'string' || !t.id) return null
  if (typeof t.spaceId !== 'string' || !spaceIds.includes(t.spaceId)) return null
  if (typeof t.url !== 'string' || !t.url.trim()) return null
  return {
    id: t.id,
    spaceId: t.spaceId,
    url: t.url,
    title: typeof t.title === 'string' ? t.title : t.url,
    isActive: t.isActive === true,
    poppedOut: t.poppedOut === true,
    ...(typeof t.windowId === 'string' && t.windowId ? { windowId: t.windowId } : {}),
  }
}

function pickWindow(raw: unknown, tabIds: Set<string>): SessionWindow | null {
  const w = raw as SessionWindow
  if (!w || typeof w !== 'object') return null
  if (typeof w.id !== 'string' || !w.id) return null
  if (!isRect(w.bounds) || w.bounds.width <= 0 || w.bounds.height <= 0) return null
  // 只保留仍会恢复的标签；窗口里一个标签都不剩就不恢复这个窗口
  const ids = (Array.isArray(w.tabIds) ? w.tabIds : []).filter(
    (id): id is string => typeof id === 'string' && tabIds.has(id)
  )
  if (ids.length === 0) return null
  const active = typeof w.activeTabId === 'string' && ids.includes(w.activeTabId)
    ? w.activeTabId
    : ids[0]
  return {
    id: w.id,
    bounds: w.bounds,
    displayId: typeof w.displayId === 'number' && Number.isFinite(w.displayId) ? w.displayId : 0,
    tabIds: ids,
    activeTabId: active,
  }
}

/**
 * 清洗存档：只保留能安全恢复的部分
 * - 空间已删除的标签丢弃（空间删了，登录态分区也没了）
 * - 重复 id 去重、空 url 丢弃
 * - 每个空间最多 MAX_RESTORE_TABS_PER_SPACE 个，且**最多一个活动标签**（多余的降级为普通标签）
 * - 窗口按 tabId 去重，且只保留仍有对应标签的；总数截到 MAX_RESTORE_WINDOWS
 */
export function sanitizeSession(
  input: unknown,
  options: { spaceIds: string[] }
): BrowserSession {
  const raw = input as Partial<BrowserSession> | null
  if (!raw || typeof raw !== 'object') return emptySession()

  const spaceIds = options.spaceIds || []
  const tabs: SessionTab[] = []
  const seenTabIds = new Set<string>()
  const activeTaken = new Set<string>()
  const perSpaceCount = new Map<string, number>()

  for (const item of Array.isArray(raw.tabs) ? raw.tabs : []) {
    const tab = pickTab(item, spaceIds)
    if (!tab || seenTabIds.has(tab.id)) continue

    const used = perSpaceCount.get(tab.spaceId) ?? 0
    if (used >= MAX_RESTORE_TABS_PER_SPACE) continue

    // 一个空间只保留第一个活动标签
    const isActive = tab.isActive && !activeTaken.has(tab.spaceId)
    if (isActive) activeTaken.add(tab.spaceId)

    seenTabIds.add(tab.id)
    perSpaceCount.set(tab.spaceId, used + 1)
    tabs.push({ ...tab, isActive })
  }

  const tabIds = new Set(tabs.map((t) => t.id))
  const windows: SessionWindow[] = []
  const seenWindowIds = new Set<string>()
  const claimedTabs = new Set<string>()
  for (const item of Array.isArray(raw.windows) ? raw.windows : []) {
    const win = pickWindow(item, tabIds)
    if (!win || seenWindowIds.has(win.id)) continue
    // 一个标签只能归一个窗口（旧存档可能把同一标签写进多个窗口）
    const free = win.tabIds.filter((id) => !claimedTabs.has(id))
    if (free.length === 0) continue
    const active = win.tabIds.includes(win.activeTabId) && free.includes(win.activeTabId)
      ? win.activeTabId
      : free[0]
    for (const id of free) claimedTabs.add(id)
    seenWindowIds.add(win.id)
    windows.push({
      ...win,
      tabIds: free,
      activeTabId: active,
    })
    if (windows.length >= MAX_RESTORE_WINDOWS) break
  }

  // 标签上的 windowId 只对真实存在的窗口生效，避免留下一堆对不上的归属
  for (const tab of tabs) {
    if (tab.windowId && !seenWindowIds.has(tab.windowId)) delete tab.windowId
  }

  return { tabs, windows }
}

/** 取某个空间的待恢复标签（按存档顺序，即关闭前的顺序） */
export function tabsForSpace(tabs: SessionTab[], spaceId: string): SessionTab[] {
  return tabs.filter((t) => t.spaceId === spaceId)
}

/** 待恢复的独立窗口：窗口内至少还有一个标签会被恢复才值得弹出来 */
export function windowsForRestoredTabs(
  windows: SessionWindow[],
  restoredTabIds: string[]
): SessionWindow[] {
  const ids = new Set(restoredTabIds)
  return windows.filter((w) => w.tabIds.some((id) => ids.has(id)))
}

/** 从当前状态构造存档（主进程保存时调用；这里只做裁剪，不做校验） */
export function buildSession(tabs: SessionTab[], windows: SessionWindow[]): BrowserSession {
  const capped = new Map<string, number>()
  const kept: SessionTab[] = []
  for (const t of tabs) {
    const used = capped.get(t.spaceId) ?? 0
    if (used >= MAX_RESTORE_TABS_PER_SPACE) continue
    capped.set(t.spaceId, used + 1)
    kept.push(t)
  }
  const ids = new Set(kept.map((t) => t.id))
  return {
    tabs: kept,
    windows: windows
      .map((w) => ({ ...w, tabIds: w.tabIds.filter((id) => ids.has(id)) }))
      .filter((w) => w.tabIds.length > 0)
      .slice(0, MAX_RESTORE_WINDOWS),
  }
}
