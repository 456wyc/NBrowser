import { describe, it, expect } from 'vitest'
import {
  computeEffectiveSizes,
  clampNum,
  DOCK,
  PANEL,
  SIDEBAR,
  WEB_AREA_MIN,
  type StoredSizes,
} from './layout-metrics'

const stored: StoredSizes = { sidebarWidth: 240, panelWidth: 460, dockHeight: 220 }

describe('clampNum', () => {
  it('正常区间内夹取', () => {
    expect(clampNum(300, 200, 400)).toBe(300)
    expect(clampNum(100, 200, 400)).toBe(200)
    expect(clampNum(500, 200, 400)).toBe(400)
  })

  it('max 小于 min 时取 min，避免区域塌成 0', () => {
    expect(clampNum(300, 300, 100)).toBe(300)
  })
})

describe('computeEffectiveSizes', () => {
  it('窗口足够大时直接沿用用户设定值', () => {
    const r = computeEffectiveSizes(stored, { sidebarVisible: true }, { w: 1600, h: 900 })
    expect(r).toEqual({ sidebarWidth: 240, panelWidth: 460, dockHeight: 220 })
  })

  it('窗口变窄时面板让位，保证主区还有最小空间', () => {
    // 1600 -> 900：侧栏 244 占位后，面板可用上限 = 900 - 244 - 260 = 396
    const r = computeEffectiveSizes(stored, { sidebarVisible: true }, { w: 900, h: 900 })
    expect(r.panelWidth).toBe(396)
    // 主区仍然有得看
    expect(900 - (r.sidebarWidth + 4) - r.panelWidth).toBeGreaterThanOrEqual(WEB_AREA_MIN)
  })

  it('侧栏隐藏后不会压缩面板宽度（有空间时保持用户设定值）', () => {
    const r = computeEffectiveSizes(stored, { sidebarVisible: false }, { w: 900, h: 900 })
    // 侧栏隐藏腾出空间，面板宽度不被压缩（仍为存储值 460，而非被压到更小）
    expect(r.panelWidth).toBe(460)
  })

  it('再窄也不会把面板压到最小值以下', () => {
    const r = computeEffectiveSizes(stored, { sidebarVisible: true }, { w: 700, h: 800 })
    expect(r.panelWidth).toBeGreaterThanOrEqual(PANEL.minWidth)
    expect(r.sidebarWidth).toBeGreaterThanOrEqual(SIDEBAR.minWidth)
  })

  it('底部面板高度受窗口高度限制（窗口变矮时被压到可用上限）', () => {
    // 存储值是 300（高于可用上限），应被压到 600 - 72 - WEB_AREA_MIN = 268
    const r = computeEffectiveSizes({ ...stored, dockHeight: 300 }, { sidebarVisible: true }, { w: 1600, h: 600 })
    expect(r.dockHeight).toBe(600 - 72 - WEB_AREA_MIN)
    expect(r.dockHeight).toBeLessThanOrEqual(DOCK.maxHeight)
  })

  it('窗口很矮时底部面板也不会塌到最小值以下', () => {
    const r = computeEffectiveSizes({ ...stored, dockHeight: 120 }, { sidebarVisible: true }, { w: 1600, h: 400 })
    expect(r.dockHeight).toBeGreaterThanOrEqual(DOCK.minHeight)
  })

  it('收敛不改变用户设定值本身（窗口拉宽后能恢复）', () => {
    const narrow = computeEffectiveSizes(stored, { sidebarVisible: true }, { w: 900, h: 900 })
    expect(narrow.panelWidth).toBeLessThan(stored.panelWidth)
    // 同一个 stored 再算一次宽窗口，仍然是原值
    const wide = computeEffectiveSizes(stored, { sidebarVisible: true }, { w: 1600, h: 900 })
    expect(wide.panelWidth).toBe(stored.panelWidth)
  })
})
