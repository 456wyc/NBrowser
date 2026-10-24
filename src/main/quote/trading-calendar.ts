/**
 * 交易日历：判断某天是否为 A 股交易日（含法定节假日与调休补班）。
 *
 * 数据来源：国务院年度放假安排（以 NateScarlet/holiday-cn 整理的公开数据为准）。
 * 2027 年数据官方尚未公布时，未列出的日期按「仅工作日」规则回退。
 * 用户可在「设置 → 交易日历」中覆盖。
 */
import type { TradingCalendarConfig } from '@shared/ipc'

export type { TradingCalendarConfig }

// 默认日历：已内置 2025、2026 真实节假日与调休
export const DEFAULT_CALENDAR: TradingCalendarConfig = {
  holidays: [
    // 2025
    '2025-01-01',
    '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
    '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
    '2025-04-04', '2025-04-05', '2025-04-06',
    '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
    '2025-05-31', '2025-06-01', '2025-06-02',
    '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
    '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
    // 2026
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07',
  ],
  makeupWorkdays: [
    // 2025
    '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
    // 2026
    '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
  ],
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 判断某天是否为交易日。
 * - 在 holidays 中 → 休市
 * - 周末且不在 makeupWorkdays 中 → 休市
 * - 周末但在 makeupWorkdays 中 → 交易（调休补班）
 * - 工作日且不在 holidays 中 → 交易
 */
export function isTradingDay(date: Date, config: TradingCalendarConfig = DEFAULT_CALENDAR): boolean {
  const key = ymd(date)
  if (config.holidays.includes(key)) return false
  const day = date.getDay()
  if (day === 0 || day === 6) {
    return config.makeupWorkdays.includes(key)
  }
  return true
}

/**
 * 判断当前是否为连续竞价（可成交）时段：交易日 + 上午 9:30-11:30 / 下午 13:00-15:00。
 *
 * 注意与「集合竞价」区分：本函数只覆盖真正撮合成交的时段，
 * 策略信号判定用它（`strategy/runner.ts`），避免用集合竞价的试探价发出假信号。
 */
export function isTradingHours(date: Date, config: TradingCalendarConfig = DEFAULT_CALENDAR): boolean {
  if (!isTradingDay(date, config)) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900)
}

/** 集合竞价时段：开盘 9:15-9:25（9:20 后不可撤单）、收盘 14:57-15:00 */
export const CALL_AUCTION_SESSIONS: ReadonlyArray<{
  start: number
  end: number
  phase: 'open' | 'close'
}> = [
  { start: 9 * 60 + 15, end: 9 * 60 + 25, phase: 'open' },
  { start: 14 * 60 + 57, end: 15 * 60, phase: 'close' },
]

export type CallAuctionPhase = 'open' | 'close' | null

/**
 * 当前处于哪个集合竞价阶段（不在集合竞价 / 非交易日返回 null）
 */
export function callAuctionPhase(
  date: Date,
  config: TradingCalendarConfig = DEFAULT_CALENDAR
): CallAuctionPhase {
  if (!isTradingDay(date, config)) return null
  const minutes = date.getHours() * 60 + date.getMinutes()
  for (const session of CALL_AUCTION_SESSIONS) {
    if (minutes >= session.start && minutes < session.end) return session.phase
  }
  return null
}

/** 是否处于集合竞价时段 */
export function isCallAuction(
  date: Date,
  config: TradingCalendarConfig = DEFAULT_CALENDAR
): boolean {
  return callAuctionPhase(date, config) !== null
}

/**
 * 是否需要按交易时段的频率拉行情：连续竞价 + 集合竞价
 *
 * 集合竞价期间报价一直在变（开盘 9:20 后不可撤、收盘 14:57 后集中撮合），
 * 盯盘要看得到这段价格，否则 9:15-9:25 会按非交易时段的 60 秒低频轮询，
 * 等 9:30 开盘才第一次刷新。策略信号仍只认 `isTradingHours`。
 */
export function isQuoteActiveHours(
  date: Date,
  config: TradingCalendarConfig = DEFAULT_CALENDAR
): boolean {
  return isTradingHours(date, config) || isCallAuction(date, config)
}

/**
 * 取未来最近的若干休市日（含节假日与调休放假），用于设置页展示。
 */
export function upcomingHolidays(config: TradingCalendarConfig = DEFAULT_CALENDAR, limit = 12): string[] {
  const today = ymd(new Date())
  return config.holidays.filter((d) => d >= today).slice(0, limit)
}
