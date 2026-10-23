import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { clampNum, DOCK, PANEL, SIDEBAR } from '@shared/layout-metrics'
import {
  HANDLE_SIZE,
  LAYOUT_STORAGE_KEY,
  PANEL_TABS,
  WEB_AREA_MIN,
  type DockTab,
  type PanelTab,
} from './config'

/**
 * 布局状态机：显隐 + 尺寸 + 标签 + 持久化 + 拖拽
 *
 * 设计要点：
 * 1. 存储值与生效值分离。窗口被拉小时只是「这一屏放不下」，不该把用户调好的宽度
 *    永久改小——所以状态里存用户设定值，渲染时再按窗口大小收敛出生效值（effective）。
 * 2. 右侧面板所有标签共用一个宽度：切换标签时宽度保持不变，拖拽一次全局生效。
 * 3. 每个区域隐藏时的尺寸保留，再打开还是原来的宽/高。
 * 4. 网页区的真实矩形由 useWebAreaBounds 实测后上报主进程，主进程不做任何推断。
 */
export interface LayoutState {
  sidebarVisible: boolean
  sidebarWidth: number

  panelVisible: boolean
  panelTab: PanelTab
  panelWidth: number

  dockVisible: boolean
  dockTab: DockTab
  dockHeight: number
}

/** 收敛后的生效尺寸（随窗口大小实时变化） */
export interface EffectiveLayout {
  sidebarWidth: number
  panelWidth: number
  dockHeight: number
}

export function defaultLayout(): LayoutState {
  return {
    sidebarVisible: true,
    sidebarWidth: SIDEBAR.defaultWidth,
    panelVisible: false,
    panelTab: 'ai',
    panelWidth: PANEL.defaultWidth,
    dockVisible: false,
    dockTab: 'visits',
    dockHeight: DOCK.defaultHeight,
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** 从 localStorage 恢复，逐字段校验：改坏一个字段不该让整个布局崩掉 */
function loadLayout(): LayoutState {
  const base = defaultLayout()
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Record<string, unknown>
    // 兼容旧版「按标签记忆宽度」的存储：取当前标签的旧值作为统一宽度的起点
    const legacyWidths = p.panelWidths as Record<string, unknown> | undefined
    return {
      sidebarVisible: bool(p.sidebarVisible, base.sidebarVisible),
      sidebarWidth: clampNum(num(p.sidebarWidth, base.sidebarWidth), SIDEBAR.minWidth, SIDEBAR.maxWidth),
      panelVisible: bool(p.panelVisible, base.panelVisible),
      panelTab: PANEL_TABS.some((t) => t.id === p.panelTab) ? (p.panelTab as PanelTab) : base.panelTab,
      panelWidth: clampNum(
        num(p.panelWidth, num(legacyWidths?.[String(p.panelTab)], PANEL.defaultWidth)),
        PANEL.minWidth,
        PANEL.maxWidth
      ),
      dockVisible: bool(p.dockVisible, base.dockVisible),
      dockTab: (p.dockTab === 'logs' ? 'logs' : 'visits') as DockTab,
      dockHeight: clampNum(num(p.dockHeight, base.dockHeight), DOCK.minHeight, DOCK.maxHeight),
    }
  } catch {
    return base
  }
}

/**
 * 按窗口尺寸收敛出生效尺寸：窗口放不下时四周让位，保证主区至少还有 WEB_AREA_MIN
 * 的空间，否则网页视图会被挤成 0 宽，看起来就像「网页不见了」。
 */
function computeEffective(layout: LayoutState, vp: { w: number; h: number }): EffectiveLayout {
  const sidebarWidth = Math.round(
    clampNum(layout.sidebarWidth, SIDEBAR.minWidth, Math.min(SIDEBAR.maxWidth, vp.w - WEB_AREA_MIN))
  )
  const sidebarTotal = layout.sidebarVisible ? sidebarWidth + HANDLE_SIZE : 0

  const panelMax = Math.max(PANEL.minWidth, Math.min(PANEL.maxWidth, vp.w - sidebarTotal - WEB_AREA_MIN))
  const panelWidth = Math.round(
    clampNum(layout.panelWidth, PANEL.minWidth, panelMax)
  )

  // 顶栏约 72px，再给主区留出最小高度，剩下的才给底部面板
  const dockMax = Math.max(DOCK.minHeight, Math.min(DOCK.maxHeight, vp.h - 72 - WEB_AREA_MIN))
  const dockHeight = Math.round(clampNum(layout.dockHeight, DOCK.minHeight, dockMax))

  return { sidebarWidth, panelWidth, dockHeight }
}

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>(loadLayout)
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))

  const effective = useMemo(() => computeEffective(layout, viewport), [layout, viewport])

  // 持久化（localStorage 不可用时静默忽略）
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
    } catch {
      /* 忽略 */
    }
  }, [layout])

  // 跟踪窗口尺寸，用于实时收敛生效尺寸
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ---------- 显隐切换 ----------

  const toggleSidebar = useCallback(() => {
    setLayout((s) => ({ ...s, sidebarVisible: !s.sidebarVisible }))
  }, [])

  /** 切换右侧面板：隐藏时恢复到上次停留的标签 */
  const togglePanel = useCallback(() => {
    setLayout((s) => ({ ...s, panelVisible: !s.panelVisible }))
  }, [])

  const toggleDock = useCallback(() => {
    setLayout((s) => ({ ...s, dockVisible: !s.dockVisible }))
  }, [])

  /** 面板内的关闭按钮：直接隐藏（区别于工具栏的切换语义） */
  const closePanel = useCallback(() => {
    setLayout((s) => ({ ...s, panelVisible: false }))
  }, [])

  const closeDock = useCallback(() => {
    setLayout((s) => ({ ...s, dockVisible: false }))
  }, [])

  /** 打开指定面板标签；已停在该标签时收起（VSCode 的点击切换语义） */
  const openPanel = useCallback((tab: PanelTab) => {
    setLayout((s) =>
      s.panelVisible && s.panelTab === tab
        ? { ...s, panelVisible: false }
        : { ...s, panelVisible: true, panelTab: tab }
    )
  }, [])

  const setPanelTab = useCallback((tab: PanelTab) => {
    setLayout((s) => ({ ...s, panelTab: tab, panelVisible: true }))
  }, [])

  const setDockTab = useCallback((tab: DockTab) => {
    setLayout((s) => ({ ...s, dockTab: tab, dockVisible: true }))
  }, [])

  const resetLayout = useCallback(() => setLayout(defaultLayout()), [])

  // ---------- 拖拽 ----------

  const startDrag = useCallback(
    (e: React.PointerEvent, el: HTMLElement, onMove: (dx: number, dy: number) => void) => {
      const pointerId = e.pointerId
      let lastX = e.clientX
      let lastY = e.clientY
      const move = (ev: PointerEvent) => {
        onMove(ev.clientX - lastX, ev.clientY - lastY)
        lastX = ev.clientX
        lastY = ev.clientY
      }
      const up = () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        try {
          el.releasePointerCapture(pointerId)
        } catch {
          /* 已释放则忽略 */
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      // 关键：在手柄元素上监听，配合 setPointerCapture，
      // 光标移到 WebContentsView 之上时 pointermove 仍派发到手柄，拖拽不会断。
      document.body.style.userSelect = 'none'
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
      // 兜底：若拖拽中手柄因「极窄自动收起」被卸载，绑在元素上的 up 可能不触发，
      // 这里在 document 再挂一个只做清理的 up，避免 body 残留 userSelect:none / 光标。
      const cleanup = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('pointerup', cleanup)
        document.removeEventListener('pointercancel', cleanup)
      }
      document.addEventListener('pointerup', cleanup)
      document.addEventListener('pointercancel', cleanup)
    },
    []
  )

  const startSidebarDrag = useCallback(
    (e: React.PointerEvent, el: HTMLElement) => {
      document.body.style.cursor = 'col-resize'
      startDrag(e, el, (dx) =>
        setLayout((s) => {
          const next = s.sidebarWidth + dx
          // 拖到很窄时直接收起，否则会在 minWidth 处「卡住」拖不动
          if (next < SIDEBAR.collapseAt) return { ...s, sidebarVisible: false, sidebarWidth: SIDEBAR.defaultWidth }
          return {
            ...s,
            sidebarVisible: true,
            sidebarWidth: clampNum(next, SIDEBAR.minWidth, SIDEBAR.maxWidth),
          }
        })
      )
    },
    [startDrag]
  )

  const startPanelDrag = useCallback(
    (e: React.PointerEvent, el: HTMLElement) => {
      document.body.style.cursor = 'col-resize'
      startDrag(e, el, (dx) =>
        setLayout((s) => {
          const next = s.panelWidth - dx
          if (next < PANEL.closeAt) return { ...s, panelVisible: false }
          return { ...s, panelWidth: clampNum(next, PANEL.minWidth, PANEL.maxWidth) }
        })
      )
    },
    [startDrag]
  )

  const startDockDrag = useCallback(
    (e: React.PointerEvent, el: HTMLElement) => {
      document.body.style.cursor = 'row-resize'
      startDrag(e, el, (_dx, dy) =>
        setLayout((s) => {
          const next = s.dockHeight - dy
          if (next < DOCK.closeAt) return { ...s, dockVisible: false }
          return { ...s, dockHeight: clampNum(next, DOCK.minHeight, DOCK.maxHeight) }
        })
      )
    },
    [startDrag]
  )

  return {
    layout,
    effective,
    toggleSidebar,
    togglePanel,
    toggleDock,
    closePanel,
    closeDock,
    openPanel,
    setPanelTab,
    setDockTab,
    resetLayout,
    startSidebarDrag,
    startPanelDrag,
    startDockDrag,
  }
}

/**
 * 实测网页区矩形并上报主进程
 *
 * 主进程拿不到 DOM，之前靠「顶栏 36 + 地址栏 36 + 手柄 4」这类常量反推，
 * 任何一处样式改动都会错位。这里直接用 getBoundingClientRect() 量出占位元素的真实位置，
 * 侧栏折叠、面板开关、窗口缩放、全屏切换都会触发 ResizeObserver，天然同步。
 */
export function useWebAreaBounds() {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastRef = useRef('')

  const push = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
    // 尺寸没变就不必打扰主进程（拖拽时每帧都会触发）
    if (key === lastRef.current) return
    lastRef.current = key
    const bounds = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    }
    window.electronAPI
      .invoke(IPC_CHANNELS.WINDOW_SET_WEB_AREA_BOUNDS, bounds)
      .catch(() => {
        // 上报失败不影响界面，下次尺寸变化会重试
      })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; push() })
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener('resize', schedule)
    push()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [push])

  return { ref, sync: push }
}
