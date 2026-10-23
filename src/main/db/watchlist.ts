import type { Database } from 'sql.js'
import { SMART_GROUPS, type WatchlistGroupKind } from '@shared/watchlist-groups'

export interface WatchlistItem {
  id: number
  symbol: string
  name: string
  group_id: number
  sort_order: number
  created_at: number
}

export interface WatchlistGroup {
  id: number
  name: string
  kind: WatchlistGroupKind
  rule: string | null
  sortOrder: number
  createdAt: number
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

/**
 * 获取所有自选股（按 sort_order 升序）
 */
export function getAllWatchlist(db: Database): WatchlistItem[] {
  const result = db.exec('SELECT * FROM watchlist ORDER BY sort_order ASC, id ASC')
  return result.length > 0 ? toObjects<WatchlistItem>(result[0]) : []
}

/**
 * 添加自选股
 */
export function addToWatchlist(
  db: Database,
  params: { symbol: string; name: string; groupId?: number }
): WatchlistItem {
  const now = Date.now()
  const groupId = params.groupId ?? 0

  // 先检查是否已存在
  const existing = db.exec('SELECT * FROM watchlist WHERE symbol = ?', [params.symbol])
  if (existing.length > 0 && existing[0].values.length > 0) {
    return toObjects<WatchlistItem>(existing[0])[0]
  }

  const maxResult = db.exec('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM watchlist')
  const maxOrder =
    maxResult.length > 0 && maxResult[0].values.length > 0
      ? Number(maxResult[0].values[0][0])
      : -1
  const sortOrder = maxOrder + 1

  db.run(
    `INSERT INTO watchlist (symbol, name, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
    [params.symbol, params.name, groupId, sortOrder, now]
  )

  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  const result = db.exec('SELECT * FROM watchlist WHERE id = ?', [id])
  return toObjects<WatchlistItem>(result[0])[0]
}

/**
 * 修改自选股所属分组
 */
export function setWatchlistGroup(db: Database, symbol: string, groupId: number): void {
  db.run('UPDATE watchlist SET group_id = ? WHERE symbol = ?', [groupId, symbol])
}

/**
 * 重命名自选股（自动识别的名称可能不准，允许用户改）
 */
export function renameWatchlistItem(db: Database, symbol: string, name: string): WatchlistItem | null {
  db.run('UPDATE watchlist SET name = ? WHERE symbol = ?', [name, symbol])
  const result = db.exec('SELECT * FROM watchlist WHERE symbol = ?', [symbol])
  return result.length > 0 && result[0].values.length > 0
    ? toObjects<WatchlistItem>(result[0])[0]
    : null
}

/**
 * 从自选股移除
 */
export function removeFromWatchlist(db: Database, symbol: string): boolean {
  const before = countWatchlist(db)
  db.run('DELETE FROM watchlist WHERE symbol = ?', [symbol])
  const after = countWatchlist(db)
  return before > after
}

function countWatchlist(db: Database): number {
  const result = db.exec('SELECT COUNT(*) as cnt FROM watchlist')
  return result.length > 0 && result[0].values.length > 0
    ? Number(result[0].values[0][0])
    : 0
}

/**
 * 检查是否已在自选股中
 */
export function isInWatchlist(db: Database, symbol: string): boolean {
  const result = db.exec('SELECT COUNT(*) as cnt FROM watchlist WHERE symbol = ?', [symbol])
  const count =
    result.length > 0 && result[0].values.length > 0
      ? Number(result[0].values[0][0])
      : 0
  return count > 0
}

/**
 * 重新排序
 */
export function reorderWatchlist(db: Database, symbols: string[]): void {
  symbols.forEach((symbol, index) => {
    db.run('UPDATE watchlist SET sort_order = ? WHERE symbol = ?', [index, symbol])
  })
}

/**
 * 获取所有股票代码列表（用于行情查询，不受分组影响）
 */
export function getAllSymbols(db: Database): string[] {
  const result = db.exec('SELECT symbol FROM watchlist ORDER BY sort_order ASC, id ASC')
  if (result.length === 0 || result[0].values.length === 0) return []
  return result[0].values.map((row: any[]) => row[0] as string)
}

// ---------- 分组 ----------

/**
 * 智能分组仅在（尚无任何 smart 分组时）播种一次
 */
export function seedSmartGroups(db: Database): void {
  const res = db.exec("SELECT COUNT(*) as cnt FROM watchlist_groups WHERE kind = 'smart'")
  const has =
    res.length > 0 && res[0].values.length > 0 ? Number(res[0].values[0][0]) > 0 : false
  if (has) return

  const now = Date.now()
  SMART_GROUPS.forEach((def, idx) => {
    db.run(
      `INSERT INTO watchlist_groups (name, kind, rule, sort_order, created_at) VALUES (?, 'smart', ?, ?, ?)`,
      [def.name, def.rule, idx, now]
    )
  })
}

/**
 * 获取所有分组：智能分组在前（按播种顺序），自定义分组在后（按 sort_order）
 */
export function getGroups(db: Database): WatchlistGroup[] {
  const result = db.exec('SELECT * FROM watchlist_groups ORDER BY kind DESC, sort_order ASC, id ASC')
  if (result.length === 0) return []
  return toObjects<any>(result[0]).map((g) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    rule: g.rule,
    sortOrder: g.sort_order,
    createdAt: g.created_at,
  }))
}

/**
 * 创建自定义分组
 */
export function createGroup(db: Database, name: string): WatchlistGroup {
  const now = Date.now()
  const maxRes = db.exec(
    "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM watchlist_groups WHERE kind = 'custom'"
  )
  const maxOrder =
    maxRes.length > 0 && maxRes[0].values.length > 0
      ? Number(maxRes[0].values[0][0])
      : -1
  db.run(
    `INSERT INTO watchlist_groups (name, kind, rule, sort_order, created_at) VALUES (?, 'custom', NULL, ?, ?)`,
    [name, maxOrder + 1, now]
  )
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  const result = db.exec('SELECT * FROM watchlist_groups WHERE id = ?', [id])
  const g = toObjects<any>(result[0])[0]
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    rule: g.rule,
    sortOrder: g.sort_order,
    createdAt: g.created_at,
  }
}

/**
 * 重命名自定义分组（智能分组不可改）
 */
export function updateGroup(db: Database, id: number, name: string): WatchlistGroup | null {
  const existing = db.exec('SELECT * FROM watchlist_groups WHERE id = ?', [id])
  if (existing.length === 0 || existing[0].values.length === 0) return null
  const g0 = toObjects<any>(existing[0])[0]
  if (g0.kind !== 'custom') return null
  db.run("UPDATE watchlist_groups SET name = ? WHERE id = ? AND kind = 'custom'", [name, id])
  const result = db.exec('SELECT * FROM watchlist_groups WHERE id = ?', [id])
  const g = toObjects<any>(result[0])[0]
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    rule: g.rule,
    sortOrder: g.sort_order,
    createdAt: g.created_at,
  }
}

/**
 * 删除自定义分组，并将其下股票退回「未分组」
 */
export function deleteGroup(db: Database, id: number): boolean {
  db.run("DELETE FROM watchlist_groups WHERE id = ? AND kind = 'custom'", [id])
  db.run('UPDATE watchlist SET group_id = 0 WHERE group_id = ?', [id])
  return true
}

