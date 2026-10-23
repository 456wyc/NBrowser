import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import {
  addTrade,
  getTradeById,
  getTrades,
  getTradesBySymbol,
  updateTrade,
  deleteTrade,
  saveReviewNote,
  getReviewNote,
  deleteReviewNote,
} from './trades'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(migration_001)
})

function baseTrade(over: Partial<Parameters<typeof addTrade>[1]> = {}) {
  return {
    symbol: '600519.SH',
    name: '贵州茅台',
    side: 'buy' as const,
    price: 1500,
    quantity: 100,
    traded_at: 1700000000000,
    fee: 5,
    source: 'manual',
    confirmed: 1,
    buy_reason: '业绩超预期',
    sell_reason: null,
    ...over,
  }
}

describe('trades DAO', () => {
  it('新增交易并读回', () => {
    const trade = addTrade(db, baseTrade())
    expect(trade).not.toBeNull()
    expect(trade!.symbol).toBe('600519.SH')
    expect(trade!.side).toBe('buy')
    expect(trade!.buy_reason).toBe('业绩超预期')
  })

  it('完全相同的交易不会重复写入（唯一索引）', () => {
    const first = addTrade(db, baseTrade({ traded_at: 1700000001000 }))
    expect(first).not.toBeNull()
    const dup = addTrade(db, baseTrade({ traded_at: 1700000001000 }))
    expect(dup).toBeNull()
  })

  it('不同成交时间视为不同交易', () => {
    const t = addTrade(db, baseTrade({ traded_at: 1700000002000, quantity: 200 }))
    expect(t).not.toBeNull()
  })

  it('按代码筛选', () => {
    addTrade(
      db,
      baseTrade({ symbol: '000001.SZ', name: '平安银行', traded_at: 1700000003000 })
    )
    const list = getTradesBySymbol(db, '000001.SZ')
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('平安银行')
  })

  it('更新交易字段', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000004000, price: 1600 }))
    const updated = updateTrade(db, trade!.id, { price: 1650, quantity: 300 })
    expect(updated!.price).toBe(1650)
    expect(updated!.quantity).toBe(300)
  })

  it('改方向时可清空另一侧理由（UI 编辑交易依赖）', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000004500 }))
    const updated = updateTrade(db, trade!.id, {
      side: 'sell',
      buy_reason: null,
      sell_reason: '止盈',
    })
    expect(updated!.side).toBe('sell')
    expect(updated!.buy_reason).toBeNull()
    expect(updated!.sell_reason).toBe('止盈')
  })

  it('未传的字段保持原值', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000004600, price: 1700 }))
    const updated = updateTrade(db, trade!.id, { quantity: 500 })
    expect(updated!.price).toBe(1700)
    expect(updated!.quantity).toBe(500)
  })

  it('列表按成交时间倒序', () => {
    const list = getTrades(db, 50)
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].traded_at).toBeGreaterThanOrEqual(list[i].traded_at)
    }
  })

  it('删除不存在的交易返回 false', () => {
    expect(deleteTrade(db, 999999)).toBe(false)
  })
})

describe('review_notes DAO', () => {
  it('保存并读取复盘笔记', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000005000 }))
    const note = saveReviewNote(db, {
      trade_id: trade!.id,
      was_reason_valid: 1,
      did_well: '拿住了',
      did_wrong: '买贵了',
      next_time: '分批建仓',
    })
    expect(note).not.toBeNull()
    expect(note!.was_reason_valid).toBe(1)

    const fetched = getReviewNote(db, trade!.id)
    expect(fetched!.did_well).toBe('拿住了')
  })

  it('只删除复盘笔记，交易本身保留', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000006500 }))
    saveReviewNote(db, {
      trade_id: trade!.id,
      was_reason_valid: 1,
      did_well: '纪律好',
      did_wrong: null,
      next_time: null,
    })
    expect(deleteReviewNote(db, trade!.id)).toBe(true)
    expect(getReviewNote(db, trade!.id)).toBeNull()
    // 交易还在（UI 的「清空笔记」依赖这一点）
    expect(getTradeById(db, trade!.id)).not.toBeNull()
  })

  it('再次保存为更新而非新增', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000006000 }))
    saveReviewNote(db, {
      trade_id: trade!.id,
      was_reason_valid: 0,
      did_well: null,
      did_wrong: '追高',
      next_time: null,
    })
    const again = saveReviewNote(db, {
      trade_id: trade!.id,
      was_reason_valid: 0,
      did_well: null,
      did_wrong: '追高且没止损',
      next_time: '设止损',
    })
    expect(again!.id).toBe(getReviewNote(db, trade!.id)!.id)
    expect(again!.did_wrong).toBe('追高且没止损')
  })

  it('删除交易时复盘笔记被级联删除（依赖 PRAGMA foreign_keys = ON）', () => {
    const trade = addTrade(db, baseTrade({ traded_at: 1700000007000 }))
    saveReviewNote(db, {
      trade_id: trade!.id,
      was_reason_valid: 1,
      did_well: 'x',
      did_wrong: 'y',
      next_time: 'z',
    })
    expect(getReviewNote(db, trade!.id)).not.toBeNull()

    expect(deleteTrade(db, trade!.id)).toBe(true)
    expect(getTradeById(db, trade!.id)).toBeNull()
    expect(getReviewNote(db, trade!.id)).toBeNull()
  })
})
