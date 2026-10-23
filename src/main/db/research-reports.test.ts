import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import { migration_004 } from './migrations/004_research_reports'
import { addReport, listReports, getReport, deleteReport } from './research-reports'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
  db.run(migration_004)
})

describe('research reports', () => {
  it('新增并读取报告全文', () => {
    const saved = addReport(db, {
      query: '分析 600519 近期业绩',
      mode: 'research',
      report: '# 概览\n贵州茅台…',
    })
    expect(saved.id).toBeGreaterThan(0)
    const full = getReport(db, saved.id)
    expect(full?.report).toBe('# 概览\n贵州茅台…')
    expect(full?.mode).toBe('research')
  })

  it('列表按时间倒序，且不含正文（只有预览）', () => {
    addReport(db, { query: '第二篇', mode: 'deepen', report: 'B'.repeat(200) })
    const list = listReports(db)
    expect(list.length).toBeGreaterThanOrEqual(2)
    // 最新的排在最前
    expect(list[0].created_at).toBeGreaterThanOrEqual(list[1].created_at)
    // 列表项只有预览长度，不带整篇正文
    expect(list[0].preview.length).toBeLessThanOrEqual(80)
    expect(list[0].length).toBeGreaterThan(0)
  })

  it('删除报告', () => {
    const r = addReport(db, { query: '待删除', mode: 'research', report: 'x' })
    expect(deleteReport(db, r.id)).toBe(true)
    expect(getReport(db, r.id)).toBeNull()
    // 删除不存在的 id 返回 false
    expect(deleteReport(db, r.id)).toBe(false)
  })

  it('读取不存在的报告返回 null', () => {
    expect(getReport(db, 999999)).toBeNull()
  })
})
