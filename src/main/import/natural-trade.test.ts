import { describe, it, expect } from 'vitest'
import {
  sanitizeNaturalTrades,
  normalizeSymbol,
  parseDate,
  naturalTradeUserPrompt,
} from './natural-trade'

const TODAY = new Date(2026, 9, 23, 14, 30, 0) // 2026-10-23 14:30

describe('sanitizeNaturalTrades', () => {
  it('解析一笔完整买入', () => {
    const out = sanitizeNaturalTrades({
      trades: [
        {
          symbol: '600519',
          name: '贵州茅台',
          side: 'buy',
          price: 1500.5,
          quantity: 100,
          fee: 5,
          tradedAt: '2026-10-23 14:32:00',
          amount: 150050,
        },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      symbol: '600519.SH',
      name: '贵州茅台',
      side: 'buy',
      price: 1500.5,
      quantity: 100,
      fee: 5,
      tradedAt: new Date(2026, 9, 23, 14, 32, 0).getTime(),
    })
  })

  it('一次输入多笔全部解析', () => {
    const out = sanitizeNaturalTrades({
      trades: [
        { symbol: '600519', name: '贵州茅台', side: 'buy', price: 1500, quantity: 100, tradedAt: '2026-10-23 14:00:00' },
        { symbol: '000001', name: '平安银行', side: 'sell', price: 11.5, quantity: 200, tradedAt: '2026-10-23 14:05:00' },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[1].symbol).toBe('000001.SZ')
    expect(out[1].side).toBe('sell')
    // fee 缺省 0
    expect(out[1].fee).toBe(0)
  })

  it('中文方向词也认', () => {
    const out = sanitizeNaturalTrades({
      trades: [{ symbol: '600519', side: '买入', price: 1, quantity: 100, tradedAt: '2026-10-23' }],
    })
    expect(out[0].side).toBe('buy')
  })

  it('字段非法/缺失的条目直接丢弃', () => {
    const out = sanitizeNaturalTrades({
      trades: [
        { symbol: 'ABC', side: 'buy', price: 1, quantity: 100, tradedAt: '2026-10-23' }, // 代码非6位
        { symbol: '600519', side: 'hold', price: 1, quantity: 100, tradedAt: '2026-10-23' }, // 方向非法
        { symbol: '600519', side: 'buy', price: 0, quantity: 100, tradedAt: '2026-10-23' }, // 价格为0
        { symbol: '600519', side: 'buy', price: 1, quantity: -5, tradedAt: '2026-10-23' }, // 数量为负
        { symbol: '600519', side: 'buy', price: 1, quantity: 100 }, // 缺时间
        { symbol: '600519', side: 'buy', price: 1, quantity: 100, tradedAt: '上周三' }, // 时间不可解析
        null,
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('非数组/缺 trades 字段返回空', () => {
    expect(sanitizeNaturalTrades({})).toEqual([])
    expect(sanitizeNaturalTrades(null)).toEqual([])
    expect(sanitizeNaturalTrades({ trades: 'x' })).toEqual([])
  })

  it('数量取整、fee/amount 容错', () => {
    const out = sanitizeNaturalTrades({
      trades: [
        { symbol: '600519', side: 'buy', price: 1, quantity: 100.4, fee: -3, amount: 0, tradedAt: '2026-10-23' },
      ],
    })
    expect(out[0].quantity).toBe(100)
    expect(out[0].fee).toBe(0) // 负手续费按 0
    expect(out[0].amount).toBeNull() // 0 金额按无
  })
})

describe('normalizeSymbol', () => {
  it('各市场代码补后缀', () => {
    expect(normalizeSymbol('600519')).toBe('600519.SH')
    expect(normalizeSymbol('688981')).toBe('688981.SH')
    expect(normalizeSymbol('000001')).toBe('000001.SZ')
    expect(normalizeSymbol('300750')).toBe('300750.SZ')
    expect(normalizeSymbol('430047')).toBe('430047.BJ')
    expect(normalizeSymbol('835185')).toBe('835185.BJ')
  })

  it('带后缀的规范化大小写', () => {
    expect(normalizeSymbol('600519.sh')).toBe('600519.SH')
  })

  it('非 6 位数字返回空', () => {
    expect(normalizeSymbol('茅台')).toBe('')
    expect(normalizeSymbol('519')).toBe('')
  })
})

describe('parseDate', () => {
  it('完整日期时间', () => {
    expect(parseDate('2026-10-23 14:32:00', TODAY)).toBe(new Date(2026, 9, 23, 14, 32, 0).getTime())
  })

  it('仅日期时补 00:00', () => {
    expect(parseDate('2026-10-23', TODAY)).toBe(new Date(2026, 9, 23, 0, 0, 0).getTime())
  })

  it('斜杠格式与个位月日', () => {
    expect(parseDate('2026/1/5 9:30', TODAY)).toBe(new Date(2026, 0, 5, 9, 30, 0).getTime())
  })

  it('纯时间按 today 补日期', () => {
    expect(parseDate('14:32', TODAY)).toBe(new Date(2026, 9, 23, 14, 32, 0).getTime())
    expect(parseDate('9:05:30', TODAY)).toBe(new Date(2026, 9, 23, 9, 5, 30).getTime())
  })

  it('毫秒/秒时间戳', () => {
    expect(parseDate(1763892320000, TODAY)).toBe(1763892320000)
    expect(parseDate(1763892320, TODAY)).toBe(1763892320000)
  })

  it('无法解析返回 null', () => {
    expect(parseDate('上周三', TODAY)).toBeNull()
    expect(parseDate('', TODAY)).toBeNull()
  })
})

describe('naturalTradeUserPrompt', () => {
  it('注入当前时间供模型解析相对日期', () => {
    const p = naturalTradeUserPrompt('今天买入茅台100股', TODAY)
    expect(p).toContain('当前时间：2026-10-23 14:30:00')
    expect(p).toContain('今天买入茅台100股')
  })
})
