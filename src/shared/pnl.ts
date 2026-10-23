import type { Trade } from './ipc'

/**
 * 单只股票的持仓与盈亏统计
 */
export interface PositionStats {
  symbol: string
  name: string
  quantity: number // 当前持仓数量
  avgCost: number // 移动加权平均成本（含手续费）
  realizedPnl: number // 已实现盈亏（已扣除卖出手续费）
  totalFee: number // 累计手续费
  buyCount: number
  sellCount: number
}

/**
 * 一次卖出对应的盈亏（用于统计胜率）
 */
export interface SellRecord {
  symbol: string
  quantity: number
  price: number
  pnl: number
  traded_at: number
}

export interface PortfolioSummary {
  positions: PositionStats[]
  sells: SellRecord[]
  totalRealizedPnl: number
  totalFee: number
  totalBuyAmount: number
  totalSellAmount: number
  winCount: number
  lossCount: number
  winRate: number // 0 ~ 1，没有卖出记录时为 0
}

interface MutablePosition {
  symbol: string
  name: string
  quantity: number
  cost: number
  realizedPnl: number
  fee: number
  buyCount: number
  sellCount: number
}

/**
 * 汇总持仓与盈亏（纯函数，便于单测）
 *
 * 成本口径：移动加权平均，买入手续费计入成本，卖出手续费从盈亏中扣除。
 * 按成交时间升序处理，与录入顺序无关。
 */
export function computePortfolio(trades: Trade[]): PortfolioSummary {
  const sorted = [...trades].sort((a, b) => a.traded_at - b.traded_at)
  const positions = new Map<string, MutablePosition>()
  const sells: SellRecord[] = []

  for (const trade of sorted) {
    let pos = positions.get(trade.symbol)
    if (!pos) {
      pos = {
        symbol: trade.symbol,
        name: trade.name,
        quantity: 0,
        cost: 0,
        realizedPnl: 0,
        fee: 0,
        buyCount: 0,
        sellCount: 0,
      }
      positions.set(trade.symbol, pos)
    }

    pos.fee += trade.fee
    // 名称以最近一次交易为准
    pos.name = trade.name

    if (trade.side === 'buy') {
      pos.quantity += trade.quantity
      pos.cost += trade.quantity * trade.price + trade.fee
      pos.buyCount += 1
    } else {
      const avgCost = pos.quantity > 0 ? pos.cost / pos.quantity : 0
      // 卖出数量超过持仓时按实际持仓结算，避免算出负持仓
      const soldQty = Math.min(trade.quantity, pos.quantity)
      const pnl = soldQty * (trade.price - avgCost) - trade.fee

      pos.realizedPnl += pnl
      pos.cost -= soldQty * avgCost
      pos.quantity -= soldQty
      // 持仓清空的平均成本归零，避免残留极小值
      if (pos.quantity <= 0) {
        pos.cost = 0
      }
      pos.sellCount += 1

      sells.push({
        symbol: trade.symbol,
        quantity: soldQty,
        price: trade.price,
        pnl,
        traded_at: trade.traded_at,
      })
    }
  }

  const positionList: PositionStats[] = Array.from(positions.values()).map((p) => ({
    symbol: p.symbol,
    name: p.name,
    quantity: p.quantity,
    avgCost: p.quantity > 0 ? p.cost / p.quantity : 0,
    realizedPnl: p.realizedPnl,
    totalFee: p.fee,
    buyCount: p.buyCount,
    sellCount: p.sellCount,
  }))

  // 仅保留有持仓或发生过交易的
  const activePositions = positionList.filter((p) => p.quantity > 0 || p.sellCount > 0)

  const totalRealizedPnl = sum(sells.map((s) => s.pnl))
  const winCount = sells.filter((s) => s.pnl > 0).length
  const lossCount = sells.filter((s) => s.pnl <= 0).length

  return {
    positions: activePositions,
    sells,
    totalRealizedPnl,
    totalFee: sum(sorted.map((t) => t.fee)),
    totalBuyAmount: sum(
      sorted.filter((t) => t.side === 'buy').map((t) => t.quantity * t.price)
    ),
    totalSellAmount: sum(
      sorted.filter((t) => t.side === 'sell').map((t) => t.quantity * t.price)
    ),
    winCount,
    lossCount,
    winRate: sells.length > 0 ? winCount / sells.length : 0,
  }
}

/**
 * 持仓的浮动盈亏（需要当前价）
 */
export function unrealizedPnl(position: PositionStats, currentPrice: number): number {
  if (position.quantity <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return 0
  }
  return position.quantity * (currentPrice - position.avgCost)
}

function sum(nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0)
}
