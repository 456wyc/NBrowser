import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { migration_001 } from '../db/migrations/001_init'
import { migration_002 } from '../db/migrations/002_quote_history'
import { backtestStrategy } from './backtest'
import type { KLine, KLinePeriod, QuoteProvider, Quote, SearchResult } from '../quote/provider'
import type { StrategyRuleConfig } from '@shared/ipc'

let SQL: SqlJsStatic
let db: Database

/** 造一段正弦波日线，均线会反复交叉，足以产生交易 */
function fakeKLines(n: number): KLine[] {
  const out: KLine[] = []
  for (let i = 0; i < n; i++) {
    const close = 100 + Math.sin(i / 4) * 12
    out.push({
      ts: Date.now() - (n - i) * 86400000,
      open: close,
      close,
      high: close + 1,
      low: close - 1,
      volume: 1000 + i,
    })
  }
  return out
}

function makeProvider(
  impl: (code?: string, period?: KLinePeriod, limit?: number) => Promise<KLine[]>
): QuoteProvider {
  return {
    name: 'mock',
    getQuotes: async (): Promise<Quote[]> => [],
    searchSymbol: async (): Promise<SearchResult[]> => [],
    getKLine: impl,
  }
}

const config: StrategyRuleConfig = {
  symbols: ['600519.SH'],
  period: 'day',
  entry: {
    logic: 'and',
    conditions: [{ type: 'ma_cross', direction: 'golden', fast: 3, slow: 8, label: '3日上穿8日' }],
  },
  exit: {
    logic: 'or',
    conditions: [{ type: 'ma_cross', direction: 'death', fast: 3, slow: 8, label: '3日下穿8日' }],
  },
  risk: {},
  description: '',
}

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(migration_001)
  db.run(migration_002) // quote_history
})

describe('backtestStrategy 数据源', () => {
  it('K 线可用时以真实日线回测（source=kline，且能跑出交易）', async () => {
    const provider = makeProvider(async () => fakeKLines(80))
    const res = await backtestStrategy(db, config, provider)
    expect(res).toHaveLength(1)
    expect(res[0].hasData).toBe(true)
    expect(res[0].source).toBe('kline')
    expect(res[0].trades.length).toBeGreaterThan(0)
  })

  it('K 线拉取失败时退回本地快照（source=snapshot）', async () => {
    const provider = makeProvider(async () => {
      throw new Error('network down')
    })
    const res = await backtestStrategy(db, config, provider)
    expect(res[0].source).toBe('snapshot')
    // 本地无快照 → 数据不足
    expect(res[0].hasData).toBe(false)
  })

  it('K 线根数不足时也退回快照', async () => {
    const provider = makeProvider(async () => fakeKLines(10))
    const res = await backtestStrategy(db, config, provider)
    expect(res[0].source).toBe('snapshot')
    expect(res[0].hasData).toBe(false)
  })

  it('给出「买入并持有」基准收益与 K 线根数', async () => {
    const provider = makeProvider(async () => fakeKLines(80))
    const res = await backtestStrategy(db, config, provider, 250)
    const r = res[0]
    const kl = fakeKLines(80)
    const expected = Number(
      (((kl[kl.length - 1].close - kl[0].close) / kl[0].close) * 100).toFixed(2)
    )
    expect(r.benchmarkPct).toBe(expected)
    expect(r.barCount).toBe(80)
  })

  it('回测区间参数会传给 provider', async () => {
    let asked = 0
    const provider = makeProvider(async () => {
      return fakeKLines(80)
    })
    // 用 60 根区间请求，provider 应收到 limit=60
    const spy = makeProvider(async (_c, _p, limit) => {
      asked = limit ?? 0
      return fakeKLines(60)
    })
    void provider
    await backtestStrategy(db, config, spy, 60)
    expect(asked).toBe(60)
  })

  it('未传 provider 时直接用本地快照', async () => {
    const res = await backtestStrategy(db, config)
    expect(res[0].source).toBe('snapshot')
  })
})
