import { describe, it, expect } from 'vitest'
import {
  emaSeries,
  macdSeries,
  kdjSeries,
  boll,
  groupHold,
  type Bar,
} from './engine'
import type { StrategyCondition } from '@shared/ipc'

function barsFromPrices(prices: number[], volume = 1000): Bar[] {
  return prices.map((p, i) => ({ ts: i * 1000, price: p, volume, open: p, high: p, low: p }))
}

function holdAt(cond: StrategyCondition, prices: number[], volumes?: number[], bars?: Bar[]): boolean {
  const vols = volumes ?? prices.map(() => 1000)
  const bs = bars ?? barsFromPrices(prices)
  const i = prices.length - 1
  return groupHold([cond], 'and', prices, vols, i, bs)
}

/** 扫描整段序列：只要任意一根满足该条件即视为触发（交叉类信号只在转折那一刻成立） */
function scanHold(cond: StrategyCondition, prices: number[]): boolean {
  const vols = prices.map(() => 1000)
  const bs = barsFromPrices(prices)
  for (let i = 5; i < prices.length; i++) {
    if (groupHold([cond], 'and', prices.slice(0, i + 1), vols.slice(0, i + 1), i, bs.slice(0, i + 1))) {
      return true
    }
  }
  return false
}

describe('EMA / MACD', () => {
  it('EMA 序列首值等于 SMA，且后期跟随价格', () => {
    const values = [10, 11, 12, 13, 14]
    const s = emaSeries(values, 3)
    expect(s[0]).toBeNull()
    expect(s[1]).toBeNull()
    // 首个有效值 = 前 3 根 SMA
    expect(s[2]).toBeCloseTo((10 + 11 + 12) / 3, 6)
    expect(s[4]).toBeGreaterThan(s[2] as number)
  })

  it('MACD 需要足够预热数据，数据足够时 DIF/DEA 有效', () => {
    const short = Array.from({ length: 20 }, () => 10)
    expect(macdSeries(short, 12, 26, 9)[short.length - 1]).toBeNull()
    const long = Array.from({ length: 45 }, (_, i) => 10 + i * 0.1)
    expect(macdSeries(long, 12, 26, 9)[long.length - 1]).not.toBeNull()
  })

  it('MACD 在先横盘后拉升的序列中出现金叉', () => {
    // 横盘 60 根：保证 DEA 已充分预热（slow 26 + signal 9），拉升段的交叉可被捕获
    const prices = Array.from({ length: 60 }, () => 10).concat([
      10.4, 10.9, 11.6, 12.4, 13.3, 14.3, 15.4, 16.6, 17.9, 19.3, 20.8, 22.4, 24.1, 25.9, 27.8,
    ])
    expect(
      scanHold(
        { type: 'macd_cross', direction: 'golden', fast: 12, slow: 26, signalPeriod: 9, label: 'MACD金叉' },
        prices
      )
    ).toBe(true)
  })

  it('MACD 在先横盘后下跌的序列中出现死叉', () => {
    const prices = Array.from({ length: 60 }, () => 20).concat([
      19.6, 19.1, 18.4, 17.6, 16.7, 15.7, 14.6, 13.4, 12.1, 10.7, 9.2, 7.6, 5.9, 4.1, 2.2,
    ])
    expect(
      scanHold(
        { type: 'macd_cross', direction: 'death', fast: 12, slow: 26, signalPeriod: 9, label: 'MACD死叉' },
        prices
      )
    ).toBe(true)
  })
})

describe('KDJ', () => {
  it('KDJ 序列在 N 根后才有效，且 K/D 落在 0~100', () => {
    const bars = barsFromPrices([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    const s = kdjSeries(bars, 9)
    expect(s[0]).toBeNull()
    expect(s[7]).toBeNull() // 9 日窗口，第 8 根（索引 7）仍不足
    const last = s[9]
    expect(last).not.toBeNull()
    expect(last!.k).toBeGreaterThanOrEqual(0)
    expect(last!.k).toBeLessThanOrEqual(100)
    expect(last!.d).toBeGreaterThanOrEqual(0)
  })

  it('先跌后涨的序列中会出现 KDJ 金叉', () => {
    const prices = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 12, 13.5, 15, 16.5, 18, 19.5]
    expect(
      scanHold({ type: 'kdj_cross', direction: 'golden', label: 'KDJ金叉' }, prices)
    ).toBe(true)
  })

  it('先涨后跌的序列中会出现 KDJ 死叉', () => {
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 18, 16.5, 15, 13.5, 12, 10.5]
    expect(scanHold({ type: 'kdj_cross', direction: 'death', label: 'KDJ死叉' }, prices)).toBe(true)
  })

  it('连续走高时 K > D（处于强势区）', () => {
    const prices = Array.from({ length: 15 }, (_, i) => 10 + i)
    const s = kdjSeries(barsFromPrices(prices), 9)
    const last = s[prices.length - 1]!
    expect(last.k).toBeGreaterThan(last.d)
  })
})

describe('布林带 / 涨跌幅 / 连续 / 排列 / 缩量', () => {
  it('布林带：突破上轨 / 跌破下轨', () => {
    const prices = Array.from({ length: 20 }, () => 10).concat([13])
    const b = boll(prices, 20, 2, prices.length - 1)!
    expect(b.upper).toBeGreaterThan(b.mid)
    expect(b.lower).toBeLessThan(b.mid)
    expect(holdAt({ type: 'boll', direction: 'break_upper', bollPeriod: 20, mult: 2, label: '上轨' }, prices)).toBe(true)
    const down = Array.from({ length: 20 }, () => 10).concat([7])
    expect(holdAt({ type: 'boll', direction: 'break_lower', bollPeriod: 20, mult: 2, label: '下轨' }, down)).toBe(true)
  })

  it('当日涨跌幅：涨幅/跌幅达阈值才成立', () => {
    const up = [10, 10, 10.5] // +5%
    expect(holdAt({ type: 'change_pct', direction: 'up', threshold: 3, label: '涨' }, up)).toBe(true)
    expect(holdAt({ type: 'change_pct', direction: 'up', threshold: 8, label: '涨' }, up)).toBe(false)
    const down = [10, 10, 9.4] // -6%
    expect(holdAt({ type: 'change_pct', direction: 'down', threshold: 5, label: '跌' }, down)).toBe(true)
  })

  it('连续涨跌：连续 3 日下跌成立，中断则否', () => {
    const prices = [10, 9.5, 9, 8.5]
    expect(holdAt({ type: 'consecutive', direction: 'down', days: 3, label: '连跌' }, prices)).toBe(true)
    const mixed = [10, 9.5, 9.7, 9.6]
    expect(holdAt({ type: 'consecutive', direction: 'down', days: 3, label: '连跌' }, mixed)).toBe(false)
  })

  it('均线排列：多头 / 空头', () => {
    const up = Array.from({ length: 20 }, (_, i) => 10 + i * 0.5,)
    expect(holdAt({ type: 'ma_alignment', direction: 'bull', fast: 5, slow: 20, label: '多头' }, up)).toBe(true)
    const down = Array.from({ length: 20 }, (_, i) => 30 - i * 0.5)
    expect(holdAt({ type: 'ma_alignment', direction: 'bear', fast: 5, slow: 20, label: '空头' }, down)).toBe(true)
  })

  it('缩量：量低于均值倍数才成立', () => {
    const prices = Array.from({ length: 21 }, () => 10)
    const volumes = Array.from({ length: 20 }, () => 1000).concat([300])
    expect(
      holdAt({ type: 'volume_shrink', threshold: 0.5, label: '缩量' }, prices, volumes)
    ).toBe(true)
    const normal = Array.from({ length: 20 }, () => 1000).concat([900])
    expect(holdAt({ type: 'volume_shrink', threshold: 0.5, label: '缩量' }, prices, normal)).toBe(false)
  })
})
