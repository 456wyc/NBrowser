import type { Database } from 'sql.js'
import type { Strategy, StrategyRuleConfig, StrategySummary } from '@shared/ipc'

export interface StrategyRecord {
  id: number
  title: string
  goal: string
  config: string
  created_at: number
  updated_at: number
}

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

function toStrategy(r: StrategyRecord): Strategy {
  return {
    id: r.id,
    title: r.title,
    goal: r.goal,
    config: JSON.parse(r.config) as StrategyRuleConfig,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function toSummary(s: Strategy): StrategySummary {
  return {
    id: s.id,
    title: s.title,
    goal: s.goal,
    created_at: s.created_at,
    symbolCount: s.config?.symbols?.length ?? 0,
    conditionCount:
      (s.config?.entry?.conditions?.length ?? 0) + (s.config?.exit?.conditions?.length ?? 0),
  }
}

/** 新增策略 */
export function addStrategy(
  db: Database,
  params: { title: string; goal: string; config: StrategyRuleConfig }
): Strategy {
  const now = Date.now()
  db.run(
    `INSERT INTO strategies (title, goal, config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [params.title, params.goal, JSON.stringify(params.config), now, now]
  )
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  return getStrategy(db, id)!
}

/** 删除策略 */
export function deleteStrategy(db: Database, id: number): boolean {
  const before = countStrategies(db)
  db.run('DELETE FROM strategies WHERE id = ?', [id])
  const after = countStrategies(db)
  return before > after
}

/** 更新策略（覆盖标题/目标/配置） */
export function updateStrategy(
  db: Database,
  params: { id: number; title: string; goal: string; config: StrategyRuleConfig }
): Strategy | null {
  db.run(
    `UPDATE strategies SET title = ?, goal = ?, config = ?, updated_at = ? WHERE id = ?`,
    [params.title, params.goal, JSON.stringify(params.config), Date.now(), params.id]
  )
  return getStrategy(db, params.id)
}

/** 单条策略 */
export function getStrategy(db: Database, id: number): Strategy | null {
  const result = db.exec('SELECT * FROM strategies WHERE id = ?', [id])
  const records = result.length > 0 ? toObjects<StrategyRecord>(result[0]) : []
  return records[0] ? toStrategy(records[0]) : null
}

/** 策略摘要列表（按更新时间倒序） */
export function listStrategies(db: Database): StrategySummary[] {
  const result = db.exec('SELECT * FROM strategies ORDER BY updated_at DESC')
  if (result.length === 0) return []
  return toObjects<StrategyRecord>(result[0]).map((r) => toSummary(toStrategy(r)))
}

function countStrategies(db: Database): number {
  const result = db.exec('SELECT COUNT(*) as cnt FROM strategies')
  return result.length > 0 && result[0].values.length > 0
    ? Number(result[0].values[0][0])
    : 0
}
