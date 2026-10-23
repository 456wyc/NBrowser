import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import { migration_003 } from './migrations/003_watchlist_groups'
import {
  addToWatchlist,
  setWatchlistGroup,
  getAllWatchlist,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  seedSmartGroups,
} from './watchlist'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(migration_001)
  db.run(migration_003)
})

describe('watchlist groups', () => {
  it('seedSmartGroups 仅首次写入 6 个智能分组', () => {
    seedSmartGroups(db)
    let groups = getGroups(db)
    const smart = groups.filter((g) => g.kind === 'smart')
    expect(smart).toHaveLength(6)

    // 再次调用不应重复插入
    seedSmartGroups(db)
    groups = getGroups(db)
    expect(groups.filter((g) => g.kind === 'smart')).toHaveLength(6)
  })

  it('智能分组在前、自定义分组在后（按 sort_order）', () => {
    createGroup(db, '持仓')
    createGroup(db, '观察')
    const groups = getGroups(db)
    const firstCustomIdx = groups.findIndex((g) => g.kind === 'custom')
    const lastSmartIdx = groups.map((g) => g.kind).lastIndexOf('smart')
    expect(lastSmartIdx).toBeLessThan(firstCustomIdx)
  })

  it('添加自选股默认进入未分组（group_id=0）', () => {
    const item = addToWatchlist(db, { symbol: '600519.SH', name: '贵州茅台' })
    expect(item.group_id).toBe(0)
  })

  it('添加自选股可指定自定义分组', () => {
    const g = createGroup(db, '持仓')
    addToWatchlist(db, { symbol: '000001.SZ', name: '平安银行', groupId: g.id })
    const item = getAllWatchlist(db).find((i) => i.symbol === '000001.SZ')!
    expect(item.group_id).toBe(g.id)
  })

  it('setWatchlistGroup 可改分组，deleteGroup 把股票退回未分组', () => {
    const g = createGroup(db, '观察')
    addToWatchlist(db, { symbol: '300750.SZ', name: '宁德时代', groupId: g.id })

    const g2 = createGroup(db, '核心')
    setWatchlistGroup(db, '300750.SZ', g2.id)
    expect(getAllWatchlist(db).find((i) => i.symbol === '300750.SZ')!.group_id).toBe(g2.id)

    deleteGroup(db, g2.id)
    // 删除分组后该股票应退回未分组
    expect(getAllWatchlist(db).find((i) => i.symbol === '300750.SZ')!.group_id).toBe(0)
    // 自定义分组被删除
    expect(getGroups(db).find((x) => x.id === g2.id)).toBeUndefined()
  })

  it('智能分组不可被删除或重命名', () => {
    const smart = getGroups(db).find((g) => g.kind === 'smart')!
    // 删除智能分组（SQL 约束 kind='custom'）应无影响
    deleteGroup(db, smart.id)
    expect(getGroups(db).some((g) => g.id === smart.id)).toBe(true)
    // 重命名智能分组返回 null
    expect(updateGroup(db, smart.id, '改名')).toBeNull()
  })
})
