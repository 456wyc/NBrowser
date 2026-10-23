import type { Database } from 'sql.js'
import { getQuoteHistory } from '../db/quote-history'
import type { QuoteProvider, KLinePeriod } from '../quote/provider'
import type { BacktestSymbolResult, BacktestTrade, StrategyRuleConfig } from '@shared/ipc'
import { ma, type Bar, groupHold } from './engine'

/**
 * 轻量回测：优先拉取真实 K 线（前复权）遍历规则，K 线不可用时退回
 * 本地轮询快照（quote_history）。满足入场条件买入、满足出场或风控卖出，
 * 统计每笔盈亏与汇总指标。
 *
 * 说明：快照序列是轮询产生的分钟级点，仅作兜底；真实日线才是可信回测依据。
 */

const MIN_BARS = 30

function snapshotBars(db: Database, symbol: string): Bar[] {
  const points = getQuoteHistory(db, symbol, 0)
  return points
    .filter((p) => typeof p.price === 'number')
    // 快照没有开高低，统一用收盘价兜底（MACD/KDJ/布林等只在真实 K 线下才完全准确）
    .map((p) => ({
      ts: p.ts,
      price: p.price,
      volume: p.volume ?? 0,
      open: p.price,
      high: p.price,
      low: p.price,
    }))
    .sort((a, b) => a.ts - b.ts)
}

/** 拉取标的序列：真实 K 线优先，失败/不足则退回本地快照 */
async function loadBars(
  db: Database,
  symbol: string,
  provider: QuoteProvider | undefined,
  period: StrategyRuleConfig['period'],
  limit: number
): Promise<{ bars: Bar[]; source: 'kline' | 'snapshot' }> {
  if (provider) {
    try {
      const kl = await provider.getKLine(symbol, (period ?? 'day') as KLinePeriod, limit)
      if (kl.length >= MIN_BARS) {
        return {
          bars: kl.map((k) => ({
            ts: k.ts,
            price: k.close,
            volume: k.volume,
            open: k.open,
            high: k.high,
            low: k.low,
          })),
          source: 'kline',
        }
      }
    } catch (err) {
      console.error(`[backtest] getKLine failed for ${symbol}: ${err}`)
    }
  }
  return { bars: snapshotBars(db, symbol), source: 'snapshot' }
}

export async function backtestStrategy(
  db: Database,
  config: StrategyRuleConfig,
  provider?: QuoteProvider,
  barsLimit = 250
): Promise<BacktestSymbolResult[]> {
  const symbols = config.symbols.length > 0 ? config.symbols : []
  const results: BacktestSymbolResult[] = []

  for (const symbol of symbols) {
    const { bars, source } = await loadBars(db, symbol, provider, config.period, barsLimit)
    if (bars.length < MIN_BARS) {
      results.push({
        symbol,
        hasData: false,
        source,
        trades: [],
        summary: { total: 0, wins: 0, losses: 0, winRate: 0, totalReturnPct: 0, maxDrawdownPct: 0 },
      })
      continue
    }

    const prices = bars.map((b) => b.price)
    const volumes = bars.map((b) => b.volume)
    const trades: BacktestTrade[] = []

    let position: { entryTs: number; entryPrice: number; entryIdx: number } | null = null

    for (let i = 1; i < bars.length; i++) {
      if (!position) {
        if (groupHold(config.entry.conditions, config.entry.logic, prices, volumes, i, bars)) {
          position = { entryTs: bars[i].ts, entryPrice: prices[i], entryIdx: i }
        }
      } else {
        // 持仓中：先判风控（止损/止盈），再判出场条件
        const ret = (prices[i] - position.entryPrice) / position.entryPrice
        const sl = config.risk.stopLossPct ?? 0
        const tp = config.risk.takeProfitPct ?? 0
        let exitReason: string | null = null
        if (sl > 0 && ret <= -sl / 100) exitReason = '止损'
        else if (tp > 0 && ret >= tp / 100) exitReason = '止盈'
        else if (groupHold(config.exit.conditions, config.exit.logic, prices, volumes, i, bars))
          exitReason = '出场条件'

        if (exitReason) {
          trades.push({
            symbol,
            entryTs: position.entryTs,
            entryPrice: position.entryPrice,
            exitTs: bars[i].ts,
            exitPrice: prices[i],
            pnlPct: ret * 100,
            exitReason,
          })
          position = null
        }
      }
    }

    // 末笔未平仓，按最后价平仓
    if (position) {
      const last = bars.length - 1
      const ret = (prices[last] - position.entryPrice) / position.entryPrice
      trades.push({
        symbol,
        entryTs: position.entryTs,
        entryPrice: position.entryPrice,
        exitTs: bars[last].ts,
        exitPrice: prices[last],
        pnlPct: ret * 100,
        exitReason: '期末平仓',
      })
    }

    // 基准：同期买入并持有（首根收盘买入、末根收盘卖出）
    const first = prices[0]
    const lastPrice = prices[prices.length - 1]
    const benchmarkPct = first > 0 ? Number((((lastPrice - first) / first) * 100).toFixed(2)) : 0

    results.push({
      symbol,
      hasData: true,
      source,
      benchmarkPct,
      barCount: bars.length,
      trades,
      summary: summarize(trades),
    })
  }

  return results
}

function summarize(trades: BacktestTrade[]) {
  const total = trades.length
  const wins = trades.filter((t) => (t.pnlPct ?? 0) > 0).length
  const losses = total - wins
  const totalReturnPct = trades.reduce((a, t) => a + (t.pnlPct ?? 0), 0)
  // 最大回撤（按累计收益序列）
  let peak = 0
  let maxDd = 0
  let cum = 0
  for (const t of trades) {
    cum += t.pnlPct ?? 0
    peak = Math.max(peak, cum)
    maxDd = Math.min(maxDd, cum - peak)
  }
  const holdDays =
    total > 0
      ? trades.reduce((a, t) => a + (t.exitTs && t.entryTs ? (t.exitTs - t.entryTs) / 86400000 : 0), 0) / total
      : 0
  return {
    total,
    wins,
    losses,
    winRate: total > 0 ? wins / total : 0,
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    maxDrawdownPct: Number(maxDd.toFixed(2)),
    avgHoldDays: Number(holdDays.toFixed(1)),
  }
}
