import type { Database } from 'sql.js'
import type { StrategySignal } from '@shared/ipc'

function toObjects<T>(result: { columns: string[]; values: any[][] }): T[] {
  if (!result || !result.values) return []
  return result.values.map((row: any[]) => {
    const obj: Record<string, any> = {}
    result.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj as T
  })
}

interface SignalRow {
  id: number
  strategy_id: number
  symbol: string
  action: string
  price: number
  reason: string
  ts: number
}

function toSignal(r: SignalRow): StrategySignal {
  return {
    id: r.id,
    strategyId: r.strategy_id,
    symbol: r.symbol,
    action: r.action as StrategySignal['action'],
    price: r.price,
    reason: r.reason,
    ts: r.ts,
  }
}

/** 记录一条买卖点信号 */
export function addSignal(db: Database, signal: StrategySignal): void {
  db.run(
    `INSERT INTO strategy_signals (strategy_id, symbol, action, price, reason, ts)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [signal.strategyId, signal.symbol, signal.action, signal.price, signal.reason, signal.ts]
  )
}

/** 读取某策略最近 N 条信号（按时间倒序） */
export function getSignals(db: Database, strategyId: number, limit = 100): StrategySignal[] {
  const result = db.exec(
    `SELECT * FROM strategy_signals
     WHERE strategy_id = ?
     ORDER BY ts DESC
     LIMIT ?`,
    [strategyId, limit]
  )
  if (result.length === 0) return []
  return toObjects<SignalRow>(result[0]).map(toSignal)
}

/** 读取某策略的持仓状态快照（最后一条信号后的持仓：最后为买则持仓中） */
export function isHoldingAfterLastSignal(db: Database, strategyId: number, symbol: string): boolean {
  const result = db.exec(
    `SELECT action FROM strategy_signals
     WHERE strategy_id = ? AND symbol = ?
     ORDER BY ts DESC LIMIT 1`,
    [strategyId, symbol]
  )
  if (result.length === 0) return false
  const last = result[0].values[0]?.[0]
  return last === 'buy'
}
