/**
 * 布局尺寸计算（主进程与渲染进程共用的纯逻辑）
 *
 * 只回答一个问题：**在给定窗口尺寸下，四周区域实际该占多少**。
 *
 * 之所以要单独抽出来：
 * - 它是纯函数，可以直接单测（窗口拉小时四周让位这类规则最容易写错又最难手测）
 * - 主进程将来若需要按同样的规则兜底，不会出现第二份实现
 *
 * 关键规则：窗口放不下时，四周区域让位，保证主区（网页）至少还有 WEB_AREA_MIN 的空间。
 * 否则网页视图会被挤成 0 宽，用户看到的就是「网页不见了」。
 */

/** 拖拽手柄厚度（每个可调整区域都有一条） */
export const HANDLE_SIZE = 4

/** 主区（网页）至少保留的空间 */
export const WEB_AREA_MIN = 260

/** 顶栏（标签栏 + 地址栏）的估算高度，仅用于推算底部面板可用高度 */
export const TOP_BAR_HEIGHT = 72

/** 主侧栏：空间切换 + 自选股 + 快捷入口 */
export const SIDEBAR = {
  defaultWidth: 240,
  minWidth: 180,
  maxWidth: 420,
  /** 拖到这个宽度以下直接收起，避免留下一条点不到的窄边 */
  collapseAt: 120,
}

/** 右侧辅助侧栏 */
export const PANEL = {
  /** 所有标签共用一个默认宽度：切换标签时面板宽度保持不变 */
  defaultWidth: 460,
  minWidth: 300,
  maxWidth: 720,
  /** 拖到这个宽度以下直接关闭 */
  closeAt: 240,
}

/** 底部面板 */
export const DOCK = {
  defaultHeight: 220,
  minHeight: 120,
  maxHeight: 520,
  closeAt: 90,
}

export interface StoredSizes {
  sidebarWidth: number
  /** 当前标签对应的面板宽度（面板按标签分别记忆宽度） */
  panelWidth: number
  dockHeight: number
}

export interface EffectiveSizes {
  sidebarWidth: number
  panelWidth: number
  dockHeight: number
}

export function clampNum(v: number, min: number, max: number): number {
  // max 可能小于 min（窗口极窄时），此时以 min 为准，保证区域不至于塌成 0
  if (max < min) return min
  return Math.max(min, Math.min(max, v))
}

/**
 * 按窗口尺寸收敛出各区域的生效尺寸
 *
 * @param sizes  用户设定的尺寸（不受窗口大小影响，窗口拉宽后能自动恢复）
 * @param flags  区域显隐（隐藏的区域不占位）
 * @param vp     窗口可视区尺寸
 */
export function computeEffectiveSizes(
  sizes: StoredSizes,
  flags: { sidebarVisible: boolean },
  vp: { w: number; h: number }
): EffectiveSizes {
  const sidebarWidth = Math.round(
    clampNum(sizes.sidebarWidth, SIDEBAR.minWidth, Math.min(SIDEBAR.maxWidth, vp.w - WEB_AREA_MIN))
  )

  const sidebarTotal = flags.sidebarVisible ? sidebarWidth + HANDLE_SIZE : 0
  const panelMax = Math.max(PANEL.minWidth, Math.min(PANEL.maxWidth, vp.w - sidebarTotal - WEB_AREA_MIN))

  const dockMax = Math.max(
    DOCK.minHeight,
    Math.min(DOCK.maxHeight, vp.h - TOP_BAR_HEIGHT - WEB_AREA_MIN)
  )

  return {
    sidebarWidth,
    panelWidth: Math.round(clampNum(sizes.panelWidth, PANEL.minWidth, panelMax)),
    dockHeight: Math.round(clampNum(sizes.dockHeight, DOCK.minHeight, dockMax)),
  }
}
