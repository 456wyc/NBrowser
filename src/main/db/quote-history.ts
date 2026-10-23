import type { Database } from 'sql.js'
import type { Quote } from '../quote/provider'
import type { QuoteHistoryPoint } from '@shared/ipc'

export type { QuoteHistoryPoint }

function toPoint(row: any): QuoteHistoryPoint {
  return {
    symbol: row.symbol,
    ts: row.ts,
    price: row.price,
    changePercent: row.change_percent,
    changeAmount: row.change_amount,
    open: row.open,
    prevClose: row.prev_close,
    high: row.high,
    low: row.low,
    volume: row.volume,
    amount: row.amount,
  }
}

/**
 * 批量写入行情快照（幂等：同一 symbol+ts 已存在则忽略）
 * 使用事务 + INSERT OR IGNORE，避免轮询重复采样时写入冲突，
 * 也防止中途失败导致只写入部分数据。
 */
export function addQuoteHistoryBatch(db: Database, quotes: Quote[]): void {
  if (quotes.length === 0) return

  db.run('BEGIN TRANSACTION')
  try {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO quote_history
       (symbol, ts, price, change_percent, change_amount, open, prev_close, high, low, volume, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const q of quotes) {
      const ts = q.timestamp || Date.now()
      stmt.run([
        q.symbol,
        ts,
        q.price,
        q.changePercent ?? null,
        q.changeAmount ?? null,
        q.open ?? null,
        q.prevClose ?? null,
        q.high ?? null,
        q.low ?? null,
        q.volume ?? null,
        q.amount ?? null,
      ])
    }
    stmt.free()
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
}

/**
 * 按时间范围查询某只股票的历史行情
 * @param fromTs 起始时间戳（毫秒，含）
 * @param toTs   结束时间戳（毫秒，含），不传则到当前
 */
export function getQuoteHistory(
  db: Database,
  symbol: string,
  fromTs: number,
  toTs?: number
): QuoteHistoryPoint[] {
  const end = toTs ?? Date.now()
  const result = db.exec(
    `SELECT * FROM quote_history
     WHERE symbol = ? AND ts >= ? AND ts <= ?
     ORDER BY ts ASC`,
    [symbol, fromTs, end]
  )
  if (result.length === 0) return []
  const cols = result[0].columns
  return result[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {}
    cols.forEach((c, i) => (obj[c] = row[i]))
    return toPoint(obj)
  })
}

/**
 * 取某只股票最近 N 条历史（用于快速预览）
 */
export function getLatestQuoteHistory(
  db: Database,
  symbol: string,
  limit: number
): QuoteHistoryPoint[] {
  const result = db.exec(
    `SELECT * FROM quote_history
     WHERE symbol = ?
     ORDER BY ts DESC
     LIMIT ?`,
    [symbol, limit]
  )
  if (result.length === 0) return []
  const cols = result[0].columns
  const rows = result[0].values
    .map((row: any[]) => {
      const obj: Record<string, any> = {}
      cols.forEach((c, i) => (obj[c] = row[i]))
      return toPoint(obj)
    })
    .reverse()
  return rows
}

/**
 * 删除指定时间之前的行情历史（用于清理膨胀数据）
 */
export function pruneQuoteHistory(db: Database, beforeTs: number): number {
  db.run('DELETE FROM quote_history WHERE ts < ?', [beforeTs])
  const res = db.exec('SELECT changes() as n')
  return res.length > 0 && res[0].values.length > 0 ? Number(res[0].values[0][0]) : 0
}
