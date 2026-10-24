import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import {
  getSession,
  setSession,
  getSpaces,
  setSpaces,
  isSessionRestoreEnabled,
  setSessionRestoreEnabled,
} from './settings'
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

describe('session persistence', () => {
  it('未存过时返回空会话', () => {
    expect(getSession(db)).toEqual({ tabs: [], windows: [] })
  })

  it('标签与独立窗口可往返存取', () => {
    setSession(db, {
      tabs: [
        {
          id: 't1',
          spaceId: 'watch',
          url: 'https://example.com/a',
          title: 'A',
          isActive: true,
          poppedOut: true,
          windowId: 'w1',
        },
        {
          id: 't2',
          spaceId: 'watch',
          url: 'https://example.com/b',
          title: 'B',
          isActive: false,
          poppedOut: true,
          windowId: 'w1',
        },
      ],
      windows: [
        {
          id: 'w1',
          bounds: { x: 1920, y: 80, width: 900, height: 700 },
          displayId: 2,
          tabIds: ['t1', 't2'],
          activeTabId: 't1',
        },
      ],
    })
    const s = getSession(db)
    expect(s.tabs.length).toBe(2)
    expect(s.tabs[0].poppedOut).toBe(true)
    expect(s.tabs[0].windowId).toBe('w1')
    expect(s.windows[0]).toEqual({
      id: 'w1',
      bounds: { x: 1920, y: 80, width: 900, height: 700 },
      displayId: 2,
      tabIds: ['t1', 't2'],
      activeTabId: 't1',
    })
  })

  it('存档损坏时返回空会话而不是抛错', () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('browser.session', '{oops')")
    expect(getSession(db)).toEqual({ tabs: [], windows: [] })
  })

  it('启动恢复开关默认开启且可关闭', () => {
    db.run("DELETE FROM settings WHERE key = 'session.restore'")
    expect(isSessionRestoreEnabled(db)).toBe(true)
    setSessionRestoreEnabled(db, false)
    expect(isSessionRestoreEnabled(db)).toBe(false)
    setSessionRestoreEnabled(db, true)
    expect(isSessionRestoreEnabled(db)).toBe(true)
  })
})
