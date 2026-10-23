import { describe, it, expect } from 'vitest'
import { matchSmartGroup } from './watchlist-groups'

describe('matchSmartGroup', () => {
  it('市场分组', () => {
    expect(matchSmartGroup('market:SH', '600519.SH', null)).toBe(true)
    expect(matchSmartGroup('market:SH', '000001.SZ', null)).toBe(false)
    expect(matchSmartGroup('market:SZ', '300750.SZ', null)).toBe(true)
    expect(matchSmartGroup('market:SZ', '688981.SH', null)).toBe(false)
  })

  it('板块分组', () => {
    expect(matchSmartGroup('board:CYB', '300750.SZ', null)).toBe(true) // 创业板
    expect(matchSmartGroup('board:CYB', '301235.SZ', null)).toBe(true)
    expect(matchSmartGroup('board:CYB', '600519.SH', null)).toBe(false)
    expect(matchSmartGroup('board:KCB', '688981.SH', null)).toBe(true) // 科创板
    expect(matchSmartGroup('board:KCB', '689009.SH', null)).toBe(true)
    expect(matchSmartGroup('board:KCB', '600519.SH', null)).toBe(false)
  })

  it('涨跌分组依赖涨跌幅', () => {
    expect(matchSmartGroup('change:up', '600519.SH', 1.5)).toBe(true)
    expect(matchSmartGroup('change:up', '600519.SH', -1.5)).toBe(false)
    expect(matchSmartGroup('change:up', '600519.SH', null)).toBe(false)
    expect(matchSmartGroup('change:down', '600519.SH', -2.3)).toBe(true)
    expect(matchSmartGroup('change:down', '600519.SH', 0)).toBe(false)
  })
})
