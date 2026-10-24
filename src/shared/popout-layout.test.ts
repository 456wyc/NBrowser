import { describe, it, expect } from 'vitest'
import {
  DEFAULT_POPOUT_SIZE,
  boundsVisibleOnDisplay,
  buildPopoutHash,
  choosePopoutBounds,
  clampToDisplay,
  defaultPopoutBounds,
  distanceToRect,
  mergeSavedBounds,
  nearestDisplay,
  parsePopoutHash,
  type DisplayInfo,
  type Rectangle,
} from './popout-layout'

function display(id: number, x: number, y: number, width: number, height: number): DisplayInfo {
  return { id, workArea: { x, y, width, height } }
}

const PRIMARY = display(1, 0, 0, 1920, 1040)
const SECOND = display(2, 1920, 0, 1440, 900)

describe('distanceToRect / nearestDisplay', () => {
  it('点在矩形内距离为 0', () => {
    expect(distanceToRect({ x: 100, y: 100 }, { x: 0, y: 0, width: 500, height: 500 })).toBe(0)
  })

  it('点在矩形外取到边的最短距离', () => {
    expect(distanceToRect({ x: 600, y: 100 }, { x: 0, y: 0, width: 500, height: 500 })).toBe(100)
    expect(distanceToRect({ x: 600, y: 700 }, { x: 0, y: 0, width: 500, height: 500 })).toBeCloseTo(
      Math.hypot(100, 200)
    )
  })

  it('按光标最近的显示器选中第二块屏', () => {
    expect(nearestDisplay([PRIMARY, SECOND], { x: 100, y: 100 })?.id).toBe(1)
    expect(nearestDisplay([PRIMARY, SECOND], { x: 2500, y: 400 })?.id).toBe(2)
  })

  it('没有显示器时返回 null', () => {
    expect(nearestDisplay([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('defaultPopoutBounds', () => {
  it('在显示器可用区居中', () => {
    const b = defaultPopoutBounds(PRIMARY, { width: 800, height: 600 })
    expect(b.x).toBe((1920 - 800) / 2)
    expect(b.y).toBe((1040 - 600) / 2)
    expect(b.width).toBe(800)
    expect(b.height).toBe(600)
  })

  it('屏幕小于默认尺寸时收敛到可用区', () => {
    const tiny = display(9, 0, 0, 640, 480)
    const b = defaultPopoutBounds(tiny)
    expect(b.width).toBeLessThanOrEqual(640)
    expect(b.height).toBeLessThanOrEqual(480)
    expect(b.width).toBeGreaterThan(0)
  })
})

describe('clampToDisplay', () => {
  it('把越界窗口拉回可用区', () => {
    const b = clampToDisplay({ x: 5000, y: 5000, width: 800, height: 600 }, PRIMARY)
    expect(b.x + b.width).toBeLessThanOrEqual(1920)
    expect(b.y + b.height).toBeLessThanOrEqual(1040)
  })

  it('负坐标也会被拉回', () => {
    const b = clampToDisplay({ x: -300, y: -100, width: 800, height: 600 }, PRIMARY)
    expect(b.x).toBe(0)
    expect(b.y).toBe(0)
  })

  it('第二块屏上按该屏原点计算', () => {
    const b = clampToDisplay({ x: 100, y: 100, width: 800, height: 600 }, SECOND)
    expect(b.x).toBe(1920)
  })
})

describe('boundsVisibleOnDisplay', () => {
  it('完全在屏内为可见', () => {
    expect(boundsVisibleOnDisplay({ x: 100, y: 100, width: 800, height: 600 }, PRIMARY)).toBe(true)
  })

  it('完全在屏外为不可见', () => {
    expect(boundsVisibleOnDisplay({ x: 4000, y: 100, width: 800, height: 600 }, PRIMARY)).toBe(false)
  })

  it('大部分露在外面（低于阈值）视为不可见', () => {
    const mostlyOutside: Rectangle = { x: 1800, y: 100, width: 800, height: 600 } // 仅 120/800 可见
    expect(boundsVisibleOnDisplay(mostlyOutside, PRIMARY)).toBe(false)
  })

  it('零尺寸视为不可见', () => {
    expect(boundsVisibleOnDisplay({ x: 0, y: 0, width: 0, height: 0 }, PRIMARY)).toBe(false)
  })
})

describe('choosePopoutBounds', () => {
  it('落在光标所在显示器上', () => {
    const b = choosePopoutBounds([PRIMARY, SECOND], { x: 2300, y: 300 })
    expect(b.x).toBeGreaterThanOrEqual(SECOND.workArea.x)
    expect(b.x + b.width).toBeLessThanOrEqual(SECOND.workArea.x + SECOND.workArea.width)
  })

  it('复用同一显示器上记住的位置', () => {
    const saved = { '2': { x: 2000, y: 120, width: 900, height: 700 } }
    const b = choosePopoutBounds([PRIMARY, SECOND], { x: 2300, y: 300 }, saved)
    expect(b).toEqual({ x: 2000, y: 120, width: 900, height: 700 })
  })

  it('记住的位置属于另一块屏时不用（回落到居中默认）', () => {
    const saved = { '1': { x: 100, y: 100, width: 900, height: 700 } }
    const b = choosePopoutBounds([PRIMARY, SECOND], { x: 2300, y: 300 }, saved)
    expect(b.x).toBeGreaterThanOrEqual(SECOND.workArea.x)
    expect(b.width).toBe(Math.min(DEFAULT_POPOUT_SIZE.width, SECOND.workArea.width - 48))
  })

  it('没有显示器给一个安全的兜底矩形', () => {
    const b = choosePopoutBounds([], { x: 0, y: 0 })
    expect(b.width).toBe(DEFAULT_POPOUT_SIZE.width)
    expect(b.height).toBe(DEFAULT_POPOUT_SIZE.height)
  })
})

describe('mergeSavedBounds', () => {
  it('按显示器分别记忆', () => {
    let saved = mergeSavedBounds(undefined, 1, { x: 10, y: 20, width: 800, height: 600 })
    saved = mergeSavedBounds(saved, 2, { x: 2000, y: 30, width: 900, height: 700 })
    expect(Object.keys(saved).sort()).toEqual(['1', '2'])
  })

  it('同一显示器覆盖旧值', () => {
    let saved = mergeSavedBounds(undefined, 1, { x: 10, y: 20, width: 800, height: 600 })
    saved = mergeSavedBounds(saved, 1, { x: 50, y: 60, width: 800, height: 600 })
    expect(saved['1']).toEqual({ x: 50, y: 60, width: 800, height: 600 })
  })

  it('超出上限丢掉最早的', () => {
    let saved: Record<string, Rectangle> = {}
    for (let i = 1; i <= 10; i++) {
      saved = mergeSavedBounds(saved, i, { x: i, y: i, width: 800, height: 600 }, 3)
    }
    expect(Object.keys(saved)).toEqual(['8', '9', '10'])
  })

  it('坐标为整数', () => {
    const saved = mergeSavedBounds(undefined, 1, { x: 10.6, y: 20.4, width: 800.5, height: 600.5 })
    expect(saved['1']).toEqual({ x: 11, y: 20, width: 801, height: 601 })
  })
})

describe('parsePopoutHash / buildPopoutHash', () => {
  it('解析出 windowId', () => {
    expect(parsePopoutHash('#/popout?win=popout-a1b2c3d4')).toBe('popout-a1b2c3d4')
    expect(parsePopoutHash('/popout?win=popout-a1b2c3d4')).toBe('popout-a1b2c3d4')
  })

  it('解码转义字符', () => {
    expect(parsePopoutHash(buildPopoutHash('a b&c'))).toBe('a b&c')
  })

  it('非独立窗口 hash 返回 null', () => {
    expect(parsePopoutHash('#/nav')).toBeNull()
    expect(parsePopoutHash('')).toBeNull()
    expect(parsePopoutHash('#/popout')).toBeNull()
  })
})
