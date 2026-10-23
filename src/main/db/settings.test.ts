import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import { getSpaces, setSpaces } from './settings'
import { loadSpaces } from '../browser/space-manager'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
})

describe('space config persistence', () => {
  it('未配置时回退内置空间（含笔记空间）', () => {
    const spaces = getSpaces(db)
    expect(spaces.map((s) => s.id)).toEqual(['watch', 'research', 'review', 'notes'])
  })

  it('loadSpaces 与 getSpaces 一致', () => {
    expect(loadSpaces(db).map((s) => s.id)).toEqual(['watch', 'research', 'review', 'notes'])
  })

  it('写入与读出自定义空间', () => {
    const custom = [
      { id: 'watch', name: '盯盘', icon: '📊' },
      { id: 'space-1', name: '我的空间', icon: '🗂' },
    ]
    setSpaces(db, custom)
    expect(getSpaces(db)).toEqual(custom)
  })

  it('损坏数据回退默认', () => {
    // 直接塞一个非法 JSON
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('spaces_config', 'not-json')")
    expect(getSpaces(db).map((s) => s.id)).toEqual(['watch', 'research', 'review', 'notes'])
  })
})
