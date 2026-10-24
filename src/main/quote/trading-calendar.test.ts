import { describe, it, expect } from 'vitest'
import {
  callAuctionPhase,
  isCallAuction,
  isQuoteActiveHours,
  isTradingDay,
  isTradingHours,
  DEFAULT_CALENDAR,
} from './trading-calendar'

function d(s: string): Date {
  // 本地时间解析，避免时区偏移
  return new Date(s + 'T00:00:00')
}

describe('trading-calendar', () => {
  it('法定节假日为休市日', () => {
    expect(isTradingDay(d('2025-01-01'))).toBe(false) // 元旦
    expect(isTradingDay(d('2025-10-01'))).toBe(false) // 国庆
    expect(isTradingDay(d('2026-02-18'))).toBe(false) // 春节
  })

  it('调休补班的周末为交易日', () => {
    expect(isTradingDay(d('2025-01-26'))).toBe(true) // 周日补班
    expect(isTradingDay(d('2025-02-08'))).toBe(true) // 周六补班
    expect(isTradingDay(d('2026-01-04'))).toBe(true) // 周日补班
    expect(isTradingDay(d('2026-09-20'))).toBe(true) // 周日补班
  })

  it('普通周末为休市日', () => {
    expect(isTradingDay(d('2025-03-15'))).toBe(false) // 周六
    expect(isTradingDay(d('2025-03-16'))).toBe(false) // 周日
  })

  it('普通工作日为交易日', () => {
    expect(isTradingDay(d('2025-03-17'))).toBe(true) // 周一
    expect(isTradingDay(d('2025-01-27'))).toBe(true) // 春节后首日（周二，非假期）
  })

  it('春节连休中的周六仍休市（假期覆盖周末）', () => {
    // 2025-02-01 是周六，且落在春节假期中
    expect(isTradingDay(d('2025-02-01'))).toBe(false)
  })

  it('未列出年份按仅工作日回退', () => {
    // 2027 数据未内置，2027-01-01 为周五 → 视为交易日
    expect(isTradingDay(d('2027-01-01'))).toBe(true)
  })

  it('isTradingHours 在节假日时段内也返回 false', () => {
    expect(isTradingHours(d('2025-10-01'))).toBe(false) // 国庆 + 上午 10 点
  })

  it('isTradingHours 在非交易时段返回 false', () => {
    const noon = new Date('2025-03-17T12:00:00') // 周一中午
    expect(isTradingHours(noon)).toBe(false)
  })

  it('isTradingHours 在交易时段返回 true', () => {
    const morning = new Date('2025-03-17T10:00:00')
    const afternoon = new Date('2025-03-17T14:00:00')
    expect(isTradingHours(morning)).toBe(true)
    expect(isTradingHours(afternoon)).toBe(true)
  })

  it('自定义配置可覆盖默认', () => {
    const cfg = { holidays: ['2025-03-17'], makeupWorkdays: [] }
    expect(isTradingDay(d('2025-03-17'), cfg)).toBe(false)
    expect(DEFAULT_CALENDAR.holidays.length).toBeGreaterThan(0)
  })
})

/** 交易日 + 具体时刻（本地时间） */
function at(dateStr: string, hh: number, mm: number): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00`)
}

const MON = '2025-03-17' // 周一，非节假日

describe('集合竞价时段', () => {
  it('开盘集合竞价 9:15-9:25', () => {
    expect(callAuctionPhase(at(MON, 9, 14))).toBeNull()
    expect(callAuctionPhase(at(MON, 9, 15))).toBe('open')
    expect(callAuctionPhase(at(MON, 9, 20))).toBe('open') // 9:20 后不可撤单
    expect(callAuctionPhase(at(MON, 9, 24))).toBe('open')
    expect(callAuctionPhase(at(MON, 9, 25))).toBeNull() // 进入静默期
  })

  it('收盘集合竞价 14:57-15:00', () => {
    expect(callAuctionPhase(at(MON, 14, 56))).toBeNull()
    expect(callAuctionPhase(at(MON, 14, 57))).toBe('close')
    expect(callAuctionPhase(at(MON, 14, 59))).toBe('close')
    expect(callAuctionPhase(at(MON, 15, 0))).toBeNull()
  })

  it('连续竞价时段不算集合竞价', () => {
    expect(callAuctionPhase(at(MON, 10, 0))).toBeNull()
    expect(callAuctionPhase(at(MON, 13, 30))).toBeNull()
  })

  it('节假日与周末没有集合竞价', () => {
    expect(callAuctionPhase(at('2025-10-01', 9, 20))).toBeNull() // 国庆
    expect(callAuctionPhase(at('2025-03-15', 9, 20))).toBeNull() // 周六
  })

  it('isCallAuction 与 callAuctionPhase 一致', () => {
    expect(isCallAuction(at(MON, 9, 20))).toBe(true)
    expect(isCallAuction(at(MON, 14, 58))).toBe(true)
    expect(isCallAuction(at(MON, 10, 0))).toBe(false)
  })
})

describe('isQuoteActiveHours（行情密集刷新窗口）', () => {
  it('连续竞价 + 开盘集合竞价 + 收盘集合竞价都算活跃', () => {
    expect(isQuoteActiveHours(at(MON, 9, 20))).toBe(true) // 开盘集合竞价
    expect(isQuoteActiveHours(at(MON, 9, 30))).toBe(true) // 开盘
    expect(isQuoteActiveHours(at(MON, 11, 30))).toBe(true)
    expect(isQuoteActiveHours(at(MON, 14, 58))).toBe(true) // 收盘集合竞价
  })

  it('9:25-9:30 静默期与午休不算活跃', () => {
    expect(isQuoteActiveHours(at(MON, 9, 25))).toBe(false)
    expect(isQuoteActiveHours(at(MON, 9, 29))).toBe(false)
    expect(isQuoteActiveHours(at(MON, 12, 0))).toBe(false)
    expect(isQuoteActiveHours(at(MON, 15, 1))).toBe(false)
  })

  it('策略信号仍只认连续竞价：集合竞价时 isTradingHours 为 false', () => {
    expect(isTradingHours(at(MON, 9, 20))).toBe(false)
    expect(isQuoteActiveHours(at(MON, 9, 20))).toBe(true)
  })
})
