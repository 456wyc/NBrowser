import { describe, it, expect } from 'vitest'
import { isTradingDay, isTradingHours, DEFAULT_CALENDAR } from './trading-calendar'

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
