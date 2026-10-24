import type { Database } from 'sql.js'
import type { AiAnalysisResult } from '../ai/types'

export interface AiAnalysisRecord {
  id: number
  url: string
  symbol: string | null
  page_type: string
  input_excerpt: string
  result_json: string
  created_at: number
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
 * 保存分析记录
 */
export function saveAnalysis(
  db: Database,
  params: {
    url: string
    symbol: string | null
    page_type: string
    input_excerpt: string
    result: AiAnalysisResult
  }
): number {
  const now = Date.now()
  const resultJson = JSON.stringify(params.result)

  db.run(
    `INSERT INTO ai_analyses (url, symbol, page_type, input_excerpt, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [params.url, params.symbol, params.page_type, params.input_excerpt, resultJson, now]
  )

  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  return id
}

/**
 * 获取单条分析记录
 */
export function getAnalysis(db: Database, id: number): AiAnalysisRecord | null {
  const result = db.exec('SELECT * FROM ai_analyses WHERE id = ?', [id])
  const records = result.length > 0 ? toObjects<AiAnalysisRecord>(result[0]) : []
  return records[0] || null
}

/**
 * 获取某只股票的分析记录列表
 */
export function getAnalysesBySymbol(db: Database, symbol: string): AiAnalysisRecord[] {
  const result = db.exec(
    `SELECT * FROM ai_analyses
     WHERE symbol = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [symbol]
  )
  return result.length > 0 ? toObjects<AiAnalysisRecord>(result[0]) : []
}

/**
 * 查询某股票在时间范围内的分析记录（复盘闭环：交易的决策依据）
 * 按时间倒序。
 */
export function getAnalysesBySymbolAndRange(
  db: Database,
  symbol: string,
  from: number,
  to: number,
  limit = 50
): AiAnalysisRecord[] {
  const result = db.exec(
    `SELECT * FROM ai_analyses
     WHERE symbol = ? AND created_at >= ? AND created_at <= ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [symbol, from, to, limit]
  )
  return result.length > 0 ? toObjects<AiAnalysisRecord>(result[0]) : []
}

/**
 * 获取近期分析记录
 */
export function getRecentAnalyses(db: Database, limit = 20): AiAnalysisRecord[] {
  const result = db.exec(
    `SELECT * FROM ai_analyses
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  )
  return result.length > 0 ? toObjects<AiAnalysisRecord>(result[0]) : []
}

/**
 * 删除分析记录
 */
export function deleteAnalysis(db: Database, id: number): boolean {
  const before = countAnalyses(db)
  db.run('DELETE FROM ai_analyses WHERE id = ?', [id])
  const after = countAnalyses(db)
  return before > after
}

function countAnalyses(db: Database): number {
  const result = db.exec('SELECT COUNT(*) as cnt FROM ai_analyses')
  return result.length > 0 && result[0].values.length > 0
    ? Number(result[0].values[0][0])
    : 0
}
