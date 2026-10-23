import type { Database } from 'sql.js'

export interface ResearchReport {
  id: number
  query: string
  mode: string
  report: string
  created_at: number
}

/** 列表项：不含正文，避免一次拉回大量文本 */
export interface ResearchReportSummary {
  id: number
  query: string
  mode: string
  created_at: number
  length: number
  preview: string
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

/** 新增研究报告 */
export function addReport(
  db: Database,
  params: { query: string; mode: string; report: string }
): ResearchReport {
  const now = Date.now()
  db.run(
    `INSERT INTO research_reports (query, mode, report, created_at) VALUES (?, ?, ?, ?)`,
    [params.query, params.mode, params.report, now]
  )
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  const result = db.exec('SELECT * FROM research_reports WHERE id = ?', [id])
  return toObjects<ResearchReport>(result[0])[0]
}

/** 报告列表（按时间倒序） */
export function listReports(db: Database, limit = 100): ResearchReportSummary[] {
  const result = db.exec(
    'SELECT * FROM research_reports ORDER BY created_at DESC, id DESC LIMIT ?',
    [limit]
  )
  if (result.length === 0) return []
  return toObjects<ResearchReport>(result[0]).map((r) => ({
    id: r.id,
    query: r.query,
    mode: r.mode,
    created_at: r.created_at,
    length: r.report.length,
    preview: r.report.slice(0, 80),
  }))
}

/** 读取单篇报告全文 */
export function getReport(db: Database, id: number): ResearchReport | null {
  const result = db.exec('SELECT * FROM research_reports WHERE id = ?', [id])
  if (result.length === 0 || result[0].values.length === 0) return null
  return toObjects<ResearchReport>(result[0])[0]
}

/** 删除报告 */
export function deleteReport(db: Database, id: number): boolean {
  const before = countReports(db)
  db.run('DELETE FROM research_reports WHERE id = ?', [id])
  return countReports(db) < before
}

function countReports(db: Database): number {
  const result = db.exec('SELECT COUNT(*) as cnt FROM research_reports')
  return result.length > 0 && result[0].values.length > 0
    ? Number(result[0].values[0][0])
    : 0
}
