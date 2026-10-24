import { describe, it, expect } from 'vitest'
import {
  selectDecisionContext,
  formatDuration,
  formatContextTime,
  extractSummary,
  type ContextVisit,
  type ContextAnalysis,
} from './review-context'

const TRADED_AT = new Date(2026, 9, 20, 10, 30).getTime() // 2026-10-20 10:30
const HOUR = 3600 * 1000
const DAY = 24 * HOUR

function visit(over: Partial<ContextVisit>): ContextVisit {
  return {
    id: 1,
    url: 'https://example.com',
    title: '某页面',
    symbol: '600519.SH',
    space: 'research',
    started_at: TRADED_AT - DAY,
    duration_ms: 60000,
    ...over,
  }
}

function analysis(over: Partial<ContextAnalysis>): ContextAnalysis {
  return {
    id: 1,
    url: 'https://example.com/a',
    symbol: '600519.SH',
    page_type: 'announcement',
    created_at: TRADED_AT - DAY,
    summary: '摘要',
    ...over,
  }
}

describe('selectDecisionContext', () => {
  it('只取窗口内、同股票的记录', () => {
    const out = selectDecisionContext({
      visits: [
        visit({ started_at: TRADED_AT - 2 * DAY }), // 窗口内
        visit({ started_at: TRADED_AT - 10 * DAY }), // 太早
        visit({ symbol: '000001.SZ', started_at: TRADED_AT - DAY }), // 别的股票
      ],
      analyses: [
        analysis({ created_at: TRADED_AT - 2 * DAY }),
        analysis({ created_at: TRADED_AT - 10 * DAY }),
      ],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out.visits).toHaveLength(1)
    expect(out.analyses).toHaveLength(1)
    expect(out.windowFrom).toBe(TRADED_AT - 3 * DAY)
  })

  it('成交后 2 小时内的记录也纳入（下单前最后一眼）', () => {
    const out = selectDecisionContext({
      visits: [
        visit({ started_at: TRADED_AT + HOUR }),
        visit({ started_at: TRADED_AT + 3 * HOUR }), // 超出成交后窗口
      ],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out.visits).toHaveLength(1)
  })

  it('按时间倒序（最近的在前）', () => {
    const out = selectDecisionContext({
      visits: [
        visit({ started_at: TRADED_AT - 3 * DAY }),
        visit({ started_at: TRADED_AT - HOUR }),
        visit({ started_at: TRADED_AT - 2 * DAY }),
      ],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out.visits.map((v) => v.started_at)).toEqual([
      TRADED_AT - HOUR,
      TRADED_AT - 2 * DAY,
      TRADED_AT - 3 * DAY,
    ])
  })

  it('symbol 为空的记录不纳入（避免噪音）', () => {
    const out = selectDecisionContext({
      visits: [visit({ symbol: null })],
      analyses: [analysis({ symbol: null })],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out.visits).toHaveLength(0)
    expect(out.analyses).toHaveLength(0)
  })

  it('汇总窗口内总研究时长', () => {
    const out = selectDecisionContext({
      visits: [
        visit({ started_at: TRADED_AT - DAY, duration_ms: 60000 }),
        visit({ started_at: TRADED_AT - 2 * DAY, duration_ms: 120000 }),
      ],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out.totalResearchMs).toBe(180000)
  })

  it('hours 被限制在 1 ~ 720', () => {
    const tooSmall = selectDecisionContext({
      visits: [],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 0,
    })
    expect(tooSmall.windowFrom).toBe(TRADED_AT - HOUR)
    const tooBig = selectDecisionContext({
      visits: [],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 99999,
    })
    expect(tooBig.windowFrom).toBe(TRADED_AT - 720 * HOUR)
  })

  it('空输入安全', () => {
    const out = selectDecisionContext({
      visits: [],
      analyses: [],
      symbol: '600519.SH',
      tradedAt: TRADED_AT,
      hours: 72,
    })
    expect(out).toMatchObject({ visits: [], analyses: [], totalResearchMs: 0 })
  })
})

describe('formatDuration', () => {
  it('秒 / 分 / 小时', () => {
    expect(formatDuration(40_000)).toBe('40 秒')
    expect(formatDuration(47 * 60_000)).toBe('47 分钟')
    expect(formatDuration(90 * 60_000)).toBe('1 小时 30 分')
    expect(formatDuration(0)).toBe('0 秒')
    expect(formatDuration(-5)).toBe('0 秒')
  })
})

describe('formatContextTime', () => {
  it('MM-DD HH:mm', () => {
    expect(formatContextTime(new Date(2026, 9, 5, 9, 5).getTime())).toBe('10-05 09:05')
  })
})

describe('extractSummary', () => {
  it('取出 summary 字段', () => {
    expect(extractSummary(JSON.stringify({ summary: '营收增长', bullish: [] }))).toBe('营收增长')
  })

  it('损坏 JSON / 缺字段 / 非字符串返回空串', () => {
    expect(extractSummary('not json')).toBe('')
    expect(extractSummary('{}')).toBe('')
    expect(extractSummary(JSON.stringify({ summary: 123 }))).toBe('')
    expect(extractSummary('')).toBe('')
  })
})
