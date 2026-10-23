import type { Database } from 'sql.js'

export interface PageVisit {
  id: number
  url: string
  title: string | null
  symbol: string | null
  space: string
  started_at: number
  duration_ms: number
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

/**
 * 新增页面访问记录
 */
export function addPageVisit(
  db: Database,
  params: {
    url: string
    title: string | null
    symbol: string | null
    space: string
    started_at: number
  }
): number {
  db.run(
    `INSERT INTO page_visits (url, title, symbol, space, started_at, duration_ms)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [params.url, params.title, params.symbol, params.space, params.started_at]
  )
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  return id
}

/**
 * 更新页面访问的停留时长
 */
export function updateVisitDuration(db: Database, id: number, durationMs: number): void {
  db.run('UPDATE page_visits SET duration_ms = ? WHERE id = ?', [durationMs, id])
}

/**
 * 获取指定日期的访问记录（按天，本地时区）
 */
export function getVisitsByDate(db: Database, date: Date, space?: string): PageVisit[] {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const args: (number | string)[] = [startOfDay.getTime(), endOfDay.getTime()]
  const spaceClause = space ? ' AND space = ?' : ''
  if (space) args.push(space)

  const result = db.exec(
    `SELECT * FROM page_visits
     WHERE started_at >= ? AND started_at <= ?${spaceClause}
     ORDER BY started_at DESC`,
    args
  )
  return result.length > 0 ? toObjects<PageVisit>(result[0]) : []
}

/**
 * 按股票聚合指定日期的访问统计
 */
export interface StockVisitSummary {
  symbol: string
  name: string | null
  visit_count: number
  total_duration_ms: number
}

/** 汇总里「未能识别出股票代码」的记录分组名（展开详情时映射为 symbol IS NULL） */
export const UNGROUPED_SYMBOL = '未分类'

export function getTodayStockSummary(
  db: Database,
  date?: Date,
  space?: string
): StockVisitSummary[] {
  const startOfDay = new Date(date ?? new Date())
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setHours(23, 59, 59, 999)

  const args: (number | string)[] = [startOfDay.getTime(), endOfDay.getTime()]
  let spaceClause = ''
  if (space) {
    spaceClause = ' AND space = ?'
    args.push(space)
  }

  // 不再过滤 symbol IS NULL：普通页面（未识别出股票）也要计入「未分类」分组，
  // 否则浏览轨迹里只剩股票详情页，看起来就像「没有记录」
  const result = db.exec(
    `SELECT
       COALESCE(symbol, '${UNGROUPED_SYMBOL}') as symbol,
       COUNT(*) as visit_count,
       SUM(duration_ms) as total_duration_ms
     FROM page_visits
     WHERE started_at >= ? AND started_at <= ?${spaceClause}
     GROUP BY symbol
     ORDER BY total_duration_ms DESC`,
    args
  )
  return result.length > 0 ? toObjects<StockVisitSummary>(result[0]) : []
}

/**
 * 获取某天某只股票的所有访问记录
 */
export function getVisitsByStockAndDate(
  db: Database,
  symbol: string,
  date: Date,
  space?: string
): PageVisit[] {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  // 「未分类」分组对应 symbol IS NULL 的记录
  const isUngrouped = symbol === UNGROUPED_SYMBOL
  const symbolClause = isUngrouped ? 'symbol IS NULL' : 'symbol = ?'
  const args: (number | string)[] = isUngrouped
    ? [startOfDay.getTime(), endOfDay.getTime()]
    : [symbol, startOfDay.getTime(), endOfDay.getTime()]
  let spaceClause = ''
  if (space) {
    spaceClause = ' AND space = ?'
    args.push(space)
  }

  const result = db.exec(
    `SELECT * FROM page_visits
     WHERE ${symbolClause} AND started_at >= ? AND started_at <= ?${spaceClause}
     ORDER BY started_at DESC`,
    args
  )
  return result.length > 0 ? toObjects<PageVisit>(result[0]) : []
}

/**
 * 删除单条浏览记录
 */
export function deleteVisit(db: Database, id: number): boolean {
  const before = db.exec('SELECT COUNT(*) as cnt FROM page_visits WHERE id = ?', [id])
  const beforeCount = before.length > 0 && before[0].values.length > 0 ? Number(before[0].values[0][0]) : 0
  if (beforeCount === 0) return false
  db.run('DELETE FROM page_visits WHERE id = ?', [id])
  return true
}

/**
 * 清除所有浏览轨迹
 */
export function clearAllVisits(db: Database): void {
  db.run('DELETE FROM page_visits')
}
