import { describe, it, expect, beforeEach, vi } from 'vitest'

// 测试交易时段判断逻辑
// 为了测试，我们把 isTradingHours 逻辑抽出来单独测

/**
 * 判断是否为 A 股交易时段（纯函数版本，便于测试）
 * 周一至周五：9:30-11:30, 13:00-15:00
 */
function isTradingHours(date: Date): boolean {
  const day = date.getDay() // 0=周日, 6=周六
  if (day === 0 || day === 6) return false

  const hours = date.getHours()
  const minutes = date.getMinutes()
  const time = hours * 60 + minutes

  // 上午 9:30 - 11:30
  if (time >= 570 && time <= 690) return true
  // 下午 13:00 - 15:00
  if (time >= 780 && time <= 900) return true

  return false
}

describe('交易时段判断', () => {
  // 周一
  it('周一上午 10:00 应该是交易时段', () => {
    const date = new Date(2024, 0, 1, 10, 0) // 2024-01-01 周一 10:00
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一上午 9:30 整应该是交易时段', () => {
    const date = new Date(2024, 0, 1, 9, 30)
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一上午 11:30 整应该是交易时段', () => {
    const date = new Date(2024, 0, 1, 11, 30)
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一上午 9:29 不是交易时段', () => {
    const date = new Date(2024, 0, 1, 9, 29)
    expect(isTradingHours(date)).toBe(false)
  })

  it('周中午休 12:00 不是交易时段', () => {
    const date = new Date(2024, 0, 1, 12, 0)
    expect(isTradingHours(date)).toBe(false)
  })

  it('周一下午 13:00 整是交易时段', () => {
    const date = new Date(2024, 0, 1, 13, 0)
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一下午 14:00 是交易时段', () => {
    const date = new Date(2024, 0, 1, 14, 0)
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一下午 15:00 整是交易时段', () => {
    const date = new Date(2024, 0, 1, 15, 0)
    expect(isTradingHours(date)).toBe(true)
  })

  it('周一下午 15:01 不是交易时段', () => {
    const date = new Date(2024, 0, 1, 15, 1)
    expect(isTradingHours(date)).toBe(false)
  })

  // 周末
  it('周六不是交易时段', () => {
    const date = new Date(2024, 0, 6, 10, 0) // 2024-01-06 周六
    expect(isTradingHours(date)).toBe(false)
  })

  it('周日不是交易时段', () => {
    const date = new Date(2024, 0, 7, 10, 0) // 2024-01-07 周日
    expect(isTradingHours(date)).toBe(false)
  })

  // 夜间
  it('晚上 20:00 不是交易时段', () => {
    const date = new Date(2024, 0, 1, 20, 0)
    expect(isTradingHours(date)).toBe(false)
  })
})
