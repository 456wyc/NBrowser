import { describe, it, expect } from 'vitest'
import { buildUserProfileText } from './agent-profile'

describe('buildUserProfileText', () => {
  it('全部为空时返回空串（调用方整段省略）', () => {
    expect(buildUserProfileText({ watchlist: [], positions: [], trail: [] })).toBe('')
  })

  it('自选股带涨跌百分比，上涨带 + 号', () => {
    const text = buildUserProfileText({
      watchlist: [
        { symbol: '600519.SH', name: '贵州茅台', changePct: 1.23 },
        { symbol: '000001.SZ', name: '平安银行', changePct: -0.45 },
        { symbol: '300750.SZ', name: '宁德时代', changePct: null },
      ],
      positions: [],
      trail: [],
    })
    expect(text).toContain('自选股（3/3）')
    expect(text).toContain('贵州茅台 600519.SH +1.23%')
    expect(text).toContain('平安银行 000001.SZ -0.45%')
    expect(text).toContain('宁德时代 300750.SZ')
    expect(text).not.toContain('null')
  })

  it('自选股超过 20 只时截断并标注总数', () => {
    const watchlist = Array.from({ length: 25 }, (_, i) => ({
      symbol: `60000${i}.SH`,
      name: `股票${i}`,
      changePct: null,
    }))
    const text = buildUserProfileText({ watchlist, positions: [], trail: [] })
    expect(text).toContain('自选股（20/25）')
    expect(text).toContain('股票19')
    expect(text).not.toContain('股票20')
  })

  it('持仓含数量与浮动盈亏', () => {
    const text = buildUserProfileText({
      watchlist: [],
      positions: [
        { symbol: '600519.SH', name: '贵州茅台', quantity: 100, unrealizedPnl: 12345.6 },
        { symbol: '000001.SZ', name: '平安银行', quantity: 200, unrealizedPnl: -800 },
      ],
      trail: [],
    })
    expect(text).toContain('持仓（2/2）')
    expect(text).toContain('贵州茅台 600519.SH 100股 浮动盈亏+12346元')
    expect(text).toContain('平安银行 000001.SZ 200股 浮动盈亏-800元')
  })

  it('轨迹按分钟展示', () => {
    const text = buildUserProfileText({
      watchlist: [],
      positions: [],
      trail: [{ symbol: '600519.SH', durationMin: 12 }],
    })
    expect(text).toContain('近期研究较多：600519.SH（12分钟）')
  })

  it('三段都有时按 自选股/持仓/轨迹 顺序输出', () => {
    const text = buildUserProfileText({
      watchlist: [{ symbol: '600519.SH', name: '贵州茅台', changePct: 0 }],
      positions: [{ symbol: '600519.SH', name: '贵州茅台', quantity: 10, unrealizedPnl: 0 }],
      trail: [{ symbol: '600519.SH', durationMin: 5 }],
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('【用户画像】')
    expect(lines[1]).toMatch(/^自选股/)
    expect(lines[2]).toMatch(/^持仓/)
    expect(lines[3]).toMatch(/^近期研究较多/)
  })
})
