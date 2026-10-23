import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import { migration_002 } from './migrations/002_quote_history'
import {
  addQuoteHistoryBatch,
  getQuoteHistory,
  getLatestQuoteHistory,
  pruneQuoteHistory,
} from './quote-history'
import type { Quote } from '../quote/provider'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
  db.run(migration_002)
})

function makeQuote(symbol: string, price: number, ts: number): Quote {
  return {
    symbol,
    name: '测试',
    price,
    changePercent: 0,
    changeAmount: 0,
    open: price,
    prevClose: price,
    high: price,
    low: price,
    volume: 100,
    amount: price * 100,
    timestamp: ts,
  }
}

describe('quote-history DAO', () => {
  it('批量写入后按范围读回', () => {
    const t0 = 1700000000000
    addQuoteHistoryBatch(db, [
      makeQuote('600519.SH', 10, t0),
      makeQuote('600519.SH', 11, t0 + 1000),
      makeQuote('000001.SZ', 20, t0),
    ])
    const hist = getQuoteHistory(db, '600519.SH', t0, t0 + 2000)
    expect(hist.length).toBe(2)
    expect(hist[0].price).toBe(10)
    expect(hist[1].price).toBe(11)
    // 另一条股票不混入
    const other = getQuoteHistory(db, '000001.SZ', t0, t0 + 2000)
    expect(other.length).toBe(1)
  })

  it('同一毫秒重复采样被忽略（幂等）', () => {
    const t = 1700000100000
    addQuoteHistoryBatch(db, [makeQuote('600519.SH', 30, t)])
    addQuoteHistoryBatch(db, [makeQuote('600519.SH', 99, t)])
    const hist = getQuoteHistory(db, '600519.SH', t, t + 10)
    expect(hist.length).toBe(1)
    // 保留的是第一次写入的值（price 30），第二条被 IGNORE
    expect(hist[0].price).toBe(30)
  })

  it('空数组写入不报错', () => {
    expect(() => addQuoteHistoryBatch(db, [])).not.toThrow()
  })

  it('默认 toTs 为当前时间，可查到之前的记录', () => {
    const old = 1700000200000
    addQuoteHistoryBatch(db, [makeQuote('600519.SH', 50, old)])
    const hist = getQuoteHistory(db, '600519.SH', old - 1000)
    expect(hist.some((h) => h.price === 50)).toBe(true)
  })

  it('getLatestQuoteHistory 返回最近 N 条（升序）', () => {
    const base = 1700000300000
    addQuoteHistoryBatch(db, [
      makeQuote('600519.SH', 1, base),
      makeQuote('600519.SH', 2, base + 1000),
      makeQuote('600519.SH', 3, base + 2000),
    ])
    const last2 = getLatestQuoteHistory(db, '600519.SH', 2)
    expect(last2.length).toBe(2)
    expect(last2[0].price).toBe(2)
    expect(last2[1].price).toBe(3)
  })

  it('pruneQuoteHistory 删除旧数据', () => {
    const cutoff = 1700000350000
    addQuoteHistoryBatch(db, [makeQuote('600519.SH', 7, cutoff - 10000)])
    const removed = pruneQuoteHistory(db, cutoff)
    expect(removed).toBeGreaterThanOrEqual(1)
    const after = getQuoteHistory(db, '600519.SH', cutoff - 20000, cutoff - 1)
    expect(after.length).toBe(0)
  })
})
