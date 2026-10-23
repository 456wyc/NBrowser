import { describe, it, expect } from 'vitest'
import { computePortfolio, unrealizedPnl } from './pnl'
import type { Trade } from './ipc'

function trade(over: Partial<Trade> & Pick<Trade, 'id' | 'side' | 'quantity' | 'price' | 'traded_at'>): Trade {
  return {
    symbol: '600519.SH',
    name: '贵州茅台',
    fee: 0,
    source: 'manual',
    confirmed: 1,
    buy_reason: null,
    sell_reason: null,
    ...over,
  }
}

describe('computePortfolio - 已实现盈亏', () => {
  it('低买高卖产生正盈亏', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, traded_at: 2000 }),
    ])
    expect(summary.totalRealizedPnl).toBeCloseTo(200)
    expect(summary.positions[0].quantity).toBe(0)
  })

  it('高买低卖产生负盈亏', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 12, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 10, traded_at: 2000 }),
    ])
    expect(summary.totalRealizedPnl).toBeCloseTo(-200)
  })

  it('买入手续费计入成本，卖出手续费扣减盈亏', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, fee: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, fee: 10, traded_at: 2000 }),
    ])
    // 成本 = 1000 + 10 = 1010；收入 = 1200 - 10 = 1190
    expect(summary.totalRealizedPnl).toBeCloseTo(180)
    expect(summary.totalFee).toBeCloseTo(20)
  })

  it('部分卖出后剩余持仓保留加权平均成本', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 40, price: 15, traded_at: 2000 }),
    ])
    const pos = summary.positions[0]
    expect(pos.quantity).toBe(60)
    expect(pos.avgCost).toBeCloseTo(10)
    expect(pos.realizedPnl).toBeCloseTo(200)
  })

  it('多次买入按移动加权平均计算成本', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'buy', quantity: 100, price: 12, traded_at: 2000 }),
      trade({ id: 3, side: 'sell', quantity: 100, price: 13, traded_at: 3000 }),
    ])
    // 平均成本 = (1000 + 1200) / 200 = 11
    expect(summary.totalRealizedPnl).toBeCloseTo(200)
    expect(summary.positions[0].avgCost).toBeCloseTo(11)
  })

  it('按成交时间排序处理，与传入顺序无关', () => {
    const unordered = computePortfolio([
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, traded_at: 2000 }),
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
    ])
    const ordered = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, traded_at: 2000 }),
    ])
    expect(unordered.totalRealizedPnl).toBeCloseTo(ordered.totalRealizedPnl)
  })

  it('没有对应持仓的卖出不会产生负持仓', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'sell', quantity: 100, price: 12, traded_at: 1000 }),
    ])
    // 只扣手续费，不凭空产生盈利
    expect(summary.positions[0].quantity).toBe(0)
    expect(summary.totalRealizedPnl).toBeCloseTo(0)
  })

  it('卖出数量超过持仓时按实际持仓结算', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 50, price: 10, traded_at: 1000 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, traded_at: 2000 }),
    ])
    expect(summary.positions[0].quantity).toBe(0)
    expect(summary.totalRealizedPnl).toBeCloseTo(100)
  })
})

describe('computePortfolio - 汇总统计', () => {
  it('只买不卖时没有已实现盈亏，保留持仓', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 1000 }),
    ])
    expect(summary.totalRealizedPnl).toBe(0)
    expect(summary.positions[0].quantity).toBe(100)
    expect(summary.winRate).toBe(0)
  })

  it('胜率按卖出笔数统计', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 100 }),
      trade({ id: 2, side: 'sell', quantity: 50, price: 15, traded_at: 200 }),
      trade({ id: 3, side: 'sell', quantity: 50, price: 8, traded_at: 300 }),
      trade({
        id: 4,
        symbol: '000001.SZ',
        name: '平安银行',
        side: 'buy',
        quantity: 100,
        price: 20,
        traded_at: 400,
      }),
      trade({
        id: 5,
        symbol: '000001.SZ',
        name: '平安银行',
        side: 'sell',
        quantity: 100,
        price: 22,
        traded_at: 500,
      }),
    ])
    expect(summary.winCount).toBe(2)
    expect(summary.lossCount).toBe(1)
    expect(summary.winRate).toBeCloseTo(2 / 3)
  })

  it('统计买卖总额', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 100 }),
      trade({ id: 2, side: 'sell', quantity: 100, price: 12, traded_at: 200 }),
    ])
    expect(summary.totalBuyAmount).toBeCloseTo(1000)
    expect(summary.totalSellAmount).toBeCloseTo(1200)
  })

  it('多只股票分别统计', () => {
    const summary = computePortfolio([
      trade({ id: 1, side: 'buy', quantity: 100, price: 10, traded_at: 100 }),
      trade({
        id: 2,
        symbol: '000001.SZ',
        name: '平安银行',
        side: 'buy',
        quantity: 200,
        price: 20,
        traded_at: 200,
      }),
    ])
    expect(summary.positions.length).toBe(2)
    expect(summary.positions.find((p) => p.symbol === '600519.SH')?.quantity).toBe(100)
    expect(summary.positions.find((p) => p.symbol === '000001.SZ')?.quantity).toBe(200)
  })

  it('空交易列表返回空汇总', () => {
    const summary = computePortfolio([])
    expect(summary.positions).toEqual([])
    expect(summary.totalRealizedPnl).toBe(0)
    expect(summary.winRate).toBe(0)
  })
})

describe('unrealizedPnl', () => {
  it('按当前价与平均成本计算浮动盈亏', () => {
    const pos = {
      symbol: '600519.SH',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 10,
      realizedPnl: 0,
      totalFee: 0,
      buyCount: 1,
      sellCount: 0,
    }
    expect(unrealizedPnl(pos, 12)).toBeCloseTo(200)
    expect(unrealizedPnl(pos, 8)).toBeCloseTo(-200)
  })

  it('无持仓或价格无效时返回 0', () => {
    const empty = {
      symbol: '600519.SH',
      name: '贵州茅台',
      quantity: 0,
      avgCost: 0,
      realizedPnl: 0,
      totalFee: 0,
      buyCount: 1,
      sellCount: 1,
    }
    expect(unrealizedPnl(empty, 12)).toBe(0)

    const pos = { ...empty, quantity: 100, avgCost: 10 }
    expect(unrealizedPnl(pos, 0)).toBe(0)
    expect(unrealizedPnl(pos, Number.NaN)).toBe(0)
  })
})
