import { useState } from 'react'

/**
 * 区域之间的拖拽手柄
 *
 * 只负责「手感」：悬停和拖拽中给出高亮反馈（CSS 处理），真正的尺寸计算交给 useLayout。
 * 横向（调宽度）与纵向（调高度）共用一套，靠 orientation 区分。
 *
 * 关键点：
 * 1. 用 Pointer Events + setPointerCapture。主区是独立 WebContentsView，盖在 DOM 之上，
 *    用 DOM 的 mousemove 拖拽时，光标一旦越过手柄进入网页视图，宿主 DOM 就收不到
 *    mousemove，拖拽当场断掉；setPointerCapture 是 OS 级指针捕获，可跨 WebContentsView。
 * 2. 手柄带可见抓点（CSS ::after 圆点），hover/拖拽有高亮，比纯透明条好认好抓。
 */
export function ResizeHandle({
  orientation,
  onPointerDown,
  title,
}: {
  orientation: 'vertical' | 'horizontal'
  onPointerDown: (e: React.PointerEvent, el: HTMLElement) => void
  title: string
}) {
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* 某些环境不支持捕获，仍可拖拽，只是越过网页视图会失效 */
    }
    setDragging(true)
    onPointerDown(e, el)
  }

  return (
    <div
      className={`resize-handle ${orientation === 'vertical' ? 'v' : 'h'}${dragging ? ' dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      title={title}
    />
  )
}
