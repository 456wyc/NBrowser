import { describe, it, expect } from 'vitest'
import { evaluateSignal, type Bar } from './engine'
import type { StrategyRuleConfig } from '@shared/ipc'

function barsFromPrices(prices: number[]): Bar[] {
  return prices.map((p, i) => ({ ts: i * 1000, price: p, volume: 1000 }))
}

const baseMaCross: Omit<StrategyRuleConfig, 'risk'> = {
  symbols: ['600519.SH'],
  period: 'day' as const,
  entry: {
    logic: 'and' as const,
    conditions: [
      { type: 'ma_cross', direction: 'golden', fast: 3, slow: 5, label: '3日上穿5日' },
    ],
  },
  exit: {
    logic: 'or' as const,
    conditions: [
      { type: 'ma_cross', direction: 'death', fast: 3, slow: 5, label: '3日下穿5日' },
    ],
  },
  description: '',
}
const maCrossConfig: StrategyRuleConfig = { ...baseMaCross, risk: { stopLossPct: 5, takeProfitPct: 10 } }
const maCrossNoRisk: StrategyRuleConfig = { ...baseMaCross, risk: {} }

describe('evaluateSignal', () => {
  it('未持仓且金叉出现 → 买入信号', () => {
    // 长期横盘后末尾反转，快线（3）恰好在最后一根上穿慢线（5）
    const prices = [10, 10, 10, 10, 10, 10, 10, 8, 8, 8, 12]
    const res = evaluateSignal(barsFromPrices(prices), maCrossConfig, null)
    expect(res.action).toBe('buy')
    expect(res.reason).toContain('入场')
  })

  it('持仓且快线下穿慢线 → 卖出信号（出场，无风控优先）', () => {
    const prices = [10, 10, 10, 10, 10, 10, 10, 12, 12, 12, 8]
    const res = evaluateSignal(barsFromPrices(prices), maCrossNoRisk, {
      entryPrice: 10,
      entryTs: 0,
    })
    expect(res.action).toBe('sell')
    expect(res.reason).toBe('出场条件')
  })

  it('持仓亏损超止损 → 卖出信号（止损）', () => {
    const prices = [10, 10, 10, 10, 10, 9.4]
    const res = evaluateSignal(barsFromPrices(prices), maCrossConfig, {
      entryPrice: 10,
      entryTs: 0,
    })
    expect(res.action).toBe('sell')
    expect(res.reason).toBe('止损')
  })

  it('持仓盈利达止盈 → 卖出信号（止盈）', () => {
    const prices = [10, 10, 10, 10, 10, 11.2]
    const res = evaluateSignal(barsFromPrices(prices), maCrossConfig, {
      entryPrice: 10,
      entryTs: 0,
    })
    expect(res.action).toBe('sell')
    expect(res.reason).toBe('止盈')
  })

  it('无持仓且未触发 → 无信号', () => {
    const prices = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    const res = evaluateSignal(barsFromPrices(prices), maCrossConfig, null)
    expect(res.action).toBeNull()
  })
})
