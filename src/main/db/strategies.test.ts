import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from './migrations/001_init'
import { migration_006 } from './migrations/006_strategies'
import {
  addStrategy,
  listStrategies,
  getStrategy,
  updateStrategy,
  deleteStrategy,
} from './strategies'
import type { StrategyRuleConfig } from '@shared/ipc'

let SQL: SqlJsStatic
let db: Database

const sampleConfig: StrategyRuleConfig = {
  symbols: ['600519'],
  period: 'day',
  entry: {
    logic: 'and',
    conditions: [{ type: 'ma_cross', direction: 'golden', fast: 5, slow: 20, label: '5日上穿20日' }],
  },
  exit: {
    logic: 'or',
    conditions: [{ type: 'price_cross_ma', direction: 'below', maPeriod: 60, label: '跌破60日线' }],
  },
  risk: { stopLossPct: 8, takeProfitPct: 20, positionPct: 30 },
  description: '测试策略',
}

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
  db.run(migration_006)
})

describe('strategies', () => {
  it('新增并读取策略（含结构化 config）', () => {
    const saved = addStrategy(db, { title: '测试策略', goal: '跌破60日线买入', config: sampleConfig })
    expect(saved.id).toBeGreaterThan(0)
    const full = getStrategy(db, saved.id)
    expect(full?.config.symbols).toEqual(['600519'])
    expect(full?.config.entry.conditions[0].fast).toBe(5)
    expect(full?.goal).toBe('跌破60日线买入')
  })

  it('列表返回摘要，按更新时间倒序', () => {
    addStrategy(db, { title: '第二篇', goal: '突破新高', config: { ...sampleConfig, symbols: [] } })
    const list = listStrategies(db)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list[0].created_at).toBeGreaterThanOrEqual(list[1].created_at)
  })

  it('更新策略会覆盖标题/目标/配置', () => {
    const r = addStrategy(db, { title: '待更新', goal: 'g', config: sampleConfig })
    const updated = updateStrategy(db, {
      id: r.id,
      title: '已更新',
      goal: '新目标',
      config: { ...sampleConfig, symbols: ['000001'] },
    })
    expect(updated?.title).toBe('已更新')
    expect(updated?.goal).toBe('新目标')
    expect(updated?.config.symbols).toEqual(['000001'])
  })

  it('删除策略', () => {
    const r = addStrategy(db, { title: '待删除', goal: 'g', config: sampleConfig })
    expect(deleteStrategy(db, r.id)).toBe(true)
    expect(getStrategy(db, r.id)).toBeNull()
    expect(deleteStrategy(db, r.id)).toBe(false)
  })
})
