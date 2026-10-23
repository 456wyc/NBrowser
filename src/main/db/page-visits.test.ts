import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import {
  addPageVisit,
  deleteVisit,
  getTodayStockSummary,
  getVisitsByStockAndDate,
  UNGROUPED_SYMBOL,
} from './page-visits'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
})

// 2026-10-19 当天 10:00（本地时区）
const DAY = new Date(2026, 9, 19, 10, 0, 0).getTime()
const NEXT_DAY = DAY + 24 * 3600 * 1000

describe('page-visits 汇总', () => {
  it('未识别股票的页面归入「未分类」分组，不再被丢弃', () => {
    addPageVisit(db, {
      url: 'https://finance.example.com/news',
      title: '财经新闻',
      symbol: null,
      space: 'watch',
      started_at: DAY,
    })
    addPageVisit(db, {
      url: 'https://xueqiu.com/S/600519',
      title: '贵州茅台',
      symbol: '600519.SH',
      space: 'watch',
      started_at: DAY,
    })

    const summaries = getTodayStockSummary(db, new Date(DAY))
    const ungrouped = summaries.find((s) => s.symbol === UNGROUPED_SYMBOL)
    const stock = summaries.find((s) => s.symbol === '600519.SH')
    expect(ungrouped).toBeDefined()
    expect(ungrouped!.visit_count).toBe(1)
    expect(stock).toBeDefined()
  })

  it('汇总只统计所选日期，不混入其他日期', () => {
    addPageVisit(db, {
      url: 'https://xueqiu.com/S/600519',
      title: '贵州茅台',
      symbol: '600519.SH',
      space: 'watch',
      started_at: NEXT_DAY,
    })
    const summaries = getTodayStockSummary(db, new Date(DAY))
    const stock = summaries.find((s) => s.symbol === '600519.SH')
    // 600519 只有当天那一条（visit_count=1），次日的不计入
    expect(stock?.visit_count).toBe(1)
  })

  it('展开「未分类」分组返回 symbol 为空的记录', () => {
    const visits = getVisitsByStockAndDate(db, UNGROUPED_SYMBOL, new Date(DAY))
    expect(visits.length).toBe(1)
    expect(visits[0].symbol).toBeNull()
    expect(visits[0].url).toContain('finance.example.com')
  })

  it('删除单条记录只影响该条，其余不受影响', () => {
    const before = getVisitsByStockAndDate(db, '600519.SH', new Date(DAY))
    expect(before.length).toBeGreaterThan(0)
    const target = before[0]

    expect(deleteVisit(db, target.id)).toBe(true)
    const after = getVisitsByStockAndDate(db, '600519.SH', new Date(DAY))
    expect(after.find((v) => v.id === target.id)).toBeUndefined()
  })

  it('删除不存在的记录返回 false', () => {
    expect(deleteVisit(db, 999999)).toBe(false)
  })

  it('按空间过滤汇总', () => {
    addPageVisit(db, {
      url: 'https://xueqiu.com/S/000001',
      title: '平安银行',
      symbol: '000001.SZ',
      space: 'research',
      started_at: DAY,
    })
    const watch = getTodayStockSummary(db, new Date(DAY), 'watch')
    expect(watch.find((s) => s.symbol === '000001.SZ')).toBeUndefined()
    const research = getTodayStockSummary(db, new Date(DAY), 'research')
    expect(research.find((s) => s.symbol === '000001.SZ')).toBeDefined()
  })
})
