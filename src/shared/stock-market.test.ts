import { describe, it, expect } from 'vitest'
import {
  guessMarket,
  isStockCodePrefix,
  normalizeSymbol,
  stockCode,
  eastmoneyQuoteUrl,
  eastmoneyAnnouncementsUrl,
} from './stock-market'

describe('stock-market', () => {
  describe('guessMarket', () => {
    it.each([
      ['600519', 'SH'],
      ['688981', 'SH'],
      ['000001', 'SZ'],
      ['300750', 'SZ'],
      ['301235', 'SZ'],
      ['430047', 'BJ'],
      ['999999', ''],
    ])('guessMarket(%s) = %s', (code, expected) => {
      expect(guessMarket(code)).toBe(expected)
    })
  })

  describe('normalizeSymbol', () => {
    it.each([
      ['688981.SH', '688981.SH'],
      ['600835.sh', '600835.SH'],
      ['301235.SH', '301235.SZ'],
      ['000001.SZ', '000001.SZ'],
      ['430047.BJ', '430047.BJ'],
      ['301235', '301235'],
      ['', ''],
    ])('normalizeSymbol(%s) = %s', (symbol, expected) => {
      expect(normalizeSymbol(symbol)).toBe(expected)
    })
  })

  describe('URL 构造', () => {
    it('行情页 URL 按规范化后的市场', () => {
      expect(eastmoneyQuoteUrl('600519.SH')).toBe('https://quote.eastmoney.com/sh600519.html')
      expect(eastmoneyQuoteUrl('000001.SZ')).toBe('https://quote.eastmoney.com/sz000001.html')
      // 错误后缀会被纠正
      expect(eastmoneyQuoteUrl('301235.SH')).toBe('https://quote.eastmoney.com/sz301235.html')
    })
    it('公告页 URL 只用 6 位代码', () => {
      expect(eastmoneyAnnouncementsUrl('600519.SH')).toBe(
        'https://data.eastmoney.com/notices/stock/600519.html'
      )
      expect(stockCode('301235.SZ')).toBe('301235')
    })
  })

  describe('isStockCodePrefix', () => {
    it('识别 A 股常见前缀', () => {
      expect(isStockCodePrefix('600519')).toBe(true)
      expect(isStockCodePrefix('301235')).toBe(true)
    })
    it('排除非 A 股代码', () => {
      expect(isStockCodePrefix('999999')).toBe(false)
      expect(isStockCodePrefix('abc')).toBe(false)
    })
  })
})
