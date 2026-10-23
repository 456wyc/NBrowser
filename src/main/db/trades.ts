import type { Database } from 'sql.js'

export type TradeSide = 'buy' | 'sell'

export interface Trade {
  id: number
  symbol: string
  name: string
  side: TradeSide
  price: number
  quantity: number
  traded_at: number
  fee: number
  source: string
  confirmed: number
  buy_reason: string | null
  sell_reason: string | null
}

export interface ReviewNote {
  id: number
  trade_id: number
  was_reason_valid: number | null // 1 成立 / 0 不成立 / null 未评价
  did_well: string | null
  did_wrong: string | null
  next_time: string | null
  updated_at: number
}

function toObjects<T>(result: { columns: string[]; values: any[][] }): T[] {
  if (!result || !result.values) return []
  return result.values.map((row) => {
    const obj: Record<string, any> = {}
    result.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj as T
  })
}

// ---------- 交易记录 ----------

/**
 * 新增交易记录
 * 命中 (symbol, side, price, quantity, traded_at) 唯一索引时返回 null，由上层提示重复
 */
export function addTrade(db: Database, params: Omit<Trade, 'id'>): Trade | null {
  const conflict = db.exec(
    `SELECT id FROM trades
     WHERE symbol = ? AND side = ? AND price = ? AND quantity = ? AND traded_at = ?`,
    [params.symbol, params.side, params.price, params.quantity, params.traded_at]
  )
  if (conflict.length > 0 && conflict[0].values.length > 0) {
    return null
  }

  try {
    db.run(
      `INSERT INTO trades (symbol, name, side, price, quantity, traded_at, fee, source, confirmed, buy_reason, sell_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.symbol,
        params.name,
        params.side,
        params.price,
        params.quantity,
        params.traded_at,
        params.fee,
        params.source,
        params.confirmed,
        params.buy_reason,
        params.sell_reason,
      ]
    )
  } catch {
    return null
  }

  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  return getTradeById(db, id)
}

export function getTradeById(db: Database, id: number): Trade | null {
  const result = db.exec('SELECT * FROM trades WHERE id = ?', [id])
  const rows = result.length > 0 ? toObjects<Trade>(result[0]) : []
  return rows[0] || null
}

/**
 * 获取交易记录（按成交时间倒序）
 */
export function getTrades(db: Database, limit = 200): Trade[] {
  const result = db.exec('SELECT * FROM trades ORDER BY traded_at DESC LIMIT ?', [limit])
  return result.length > 0 ? toObjects<Trade>(result[0]) : []
}

/**
 * 按时间范围筛选
 */
export function getTradesByDateRange(db: Database, from: number, to: number): Trade[] {
  const result = db.exec(
    `SELECT * FROM trades WHERE traded_at >= ? AND traded_at <= ? ORDER BY traded_at DESC`,
    [from, to]
  )
  return result.length > 0 ? toObjects<Trade>(result[0]) : []
}

/**
 * 某只股票的全部交易
 */
export function getTradesBySymbol(db: Database, symbol: string): Trade[] {
  const result = db.exec(
    `SELECT * FROM trades WHERE symbol = ? ORDER BY traded_at DESC`,
    [symbol]
  )
  return result.length > 0 ? toObjects<Trade>(result[0]) : []
}

export function updateTrade(
  db: Database,
  id: number,
  params: Partial<Omit<Trade, 'id'>>
): Trade | null {
  const allowed: Array<keyof Omit<Trade, 'id'>> = [
    'symbol',
    'name',
    'side',
    'price',
    'quantity',
    'traded_at',
    'fee',
    'source',
    'confirmed',
    'buy_reason',
    'sell_reason',
  ]

  const sets: string[] = []
  const values: any[] = []
  for (const key of allowed) {
    const val = (params as any)[key]
    if (val !== undefined) {
      sets.push(`${key} = ?`)
      values.push(val)
    }
  }
  if (sets.length === 0) return getTradeById(db, id)

  values.push(id)
  db.run(`UPDATE trades SET ${sets.join(', ')} WHERE id = ?`, values)
  return getTradeById(db, id)
}

/**
 * 删除交易（复盘笔记通过外键级联删除）
 */
export function deleteTrade(db: Database, id: number): boolean {
  const before = db.exec('SELECT COUNT(*) as cnt FROM trades')
  const beforeCount =
    before.length > 0 && before[0].values.length > 0 ? Number(before[0].values[0][0]) : 0

  db.run('DELETE FROM trades WHERE id = ?', [id])

  const after = db.exec('SELECT COUNT(*) as cnt FROM trades')
  const afterCount =
    after.length > 0 && after[0].values.length > 0 ? Number(after[0].values[0][0]) : 0

  return afterCount < beforeCount
}

// ---------- 复盘笔记 ----------

/**
 * 获取某笔交易的复盘笔记
 */
export function getReviewNote(db: Database, tradeId: number): ReviewNote | null {
  const result = db.exec('SELECT * FROM review_notes WHERE trade_id = ?', [tradeId])
  const rows = result.length > 0 ? toObjects<ReviewNote>(result[0]) : []
  return rows[0] || null
}

/**
 * 保存复盘笔记（不存在则插入，存在则更新）
 */
export function saveReviewNote(
  db: Database,
  params: {
    trade_id: number
    was_reason_valid: number | null
    did_well: string | null
    did_wrong: string | null
    next_time: string | null
  }
): ReviewNote | null {
  const existing = getReviewNote(db, params.trade_id)
  const now = Date.now()

  if (existing) {
    db.run(
      `UPDATE review_notes
       SET was_reason_valid = ?, did_well = ?, did_wrong = ?, next_time = ?, updated_at = ?
       WHERE trade_id = ?`,
      [
        params.was_reason_valid,
        params.did_well,
        params.did_wrong,
        params.next_time,
        now,
        params.trade_id,
      ]
    )
  } else {
    db.run(
      `INSERT INTO review_notes (trade_id, was_reason_valid, did_well, did_wrong, next_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.trade_id,
        params.was_reason_valid,
        params.did_well,
        params.did_wrong,
        params.next_time,
        now,
      ]
    )
  }

  return getReviewNote(db, params.trade_id)
}

export function deleteReviewNote(db: Database, tradeId: number): boolean {
  const before = getReviewNote(db, tradeId)
  if (!before) return false
  db.run('DELETE FROM review_notes WHERE trade_id = ?', [tradeId])
  return true
}
