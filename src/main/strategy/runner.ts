import { BrowserWindow, Notification } from 'electron'
import type { Database } from 'sql.js'
import type { QuoteProvider, Quote, KLinePeriod } from '../quote/provider'
import {
  isTradingHours as isTradingHoursFn,
  DEFAULT_CALENDAR,
  type TradingCalendarConfig,
} from '../quote/trading-calendar'
import type { Strategy, StrategySignal } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import { evaluateSignal, makeSignal, type Bar, type Holding } from './engine'
import { getLatestQuoteHistory } from '../db/quote-history'
import { addSignal, getSignals } from '../db/strategy-signals'
import { getDb } from '../db'

const TICK_MS = 5000 // 与行情轮询同频
const INIT_BARS = 120 // 冷启动预载最近 N 条历史，供均线/RSI 计算
const MAX_BARS = 500

interface RunningEntry {
  strategy: Strategy
  bars: Map<string, Bar[]>
  holding: Map<string, Holding | null>
  timer: NodeJS.Timeout
  startedAt: number
}

/**
 * 把时间戳对齐到所在周期的起点（日线→当日 0 点，分钟线→该周期起始分钟）。
 * 用于保证「一根 K 线 = 一个周期」，实时价只更新当前这根的收盘价。
 */
export function bucketTs(ts: number, period: Strategy['config']['period']): number {
  const d = new Date(ts)
  if (period === 'day' || period === 'week' || !period) {
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const mins = period === '60m' ? 60 : period === '15m' ? 15 : 5
  d.setMinutes(Math.floor(d.getMinutes() / mins) * mins, 0, 0)
  return d.getTime()
}

export interface RunningStrategyInfo {
  id: number
  title: string
  symbols: string[]
  startedAt: number
}

/**
 * 策略运行管理器：
 * 对每个「运行中」策略，按 TICK_MS 拉取标的实时行情，追加到 K 线序列，
 * 用与回测一致的引擎判定买卖点；触发时在面板推送信号 + 系统桌面通知（买卖点提示）。
 * 仅在 A 股交易时段判定信号，避免盘后静态价产生假信号。
 */
export class StrategyRunner {
  private provider: QuoteProvider
  private running = new Map<number, RunningEntry>()
  private calendar: TradingCalendarConfig = DEFAULT_CALENDAR

  constructor(provider: QuoteProvider) {
    this.provider = provider
  }

  isRunning(id: number): boolean {
    return this.running.has(id)
  }

  getRunning(): RunningStrategyInfo[] {
    return [...this.running.values()].map((e) => ({
      id: e.strategy.id,
      title: e.strategy.title,
      symbols: e.strategy.config.symbols,
      startedAt: e.startedAt,
    }))
  }

  async start(strategy: Strategy): Promise<void> {
    if (this.running.has(strategy.id)) return
    const db = await getDb()
    try {
      this.calendar = (await import('../db/settings')).getTradingCalendar(db)
    } catch {
      /* 用默认日历 */
    }

    const bars = new Map<string, Bar[]>()
    const holding = new Map<string, Holding | null>()

    // 从历史信号恢复持仓状态（含真实入场价，避免止损/止盈误判）
    const recent = getSignals(db, strategy.id, 500)
    for (const sym of strategy.config.symbols) {
      const hist = await this.loadInitialBars(db, sym, strategy.config.period)
      bars.set(sym, hist)

      const last = recent.filter((s) => s.symbol === sym)[0] // 倒序第一条 = 最近一次
      holding.set(
        sym,
        last && last.action === 'buy' ? { entryPrice: last.price, entryTs: last.ts } : null
      )
    }

    const entry: RunningEntry = {
      strategy,
      bars,
      holding,
      timer: setInterval(() => void this.tick(strategy.id), TICK_MS),
      startedAt: Date.now(),
    }
    this.running.set(strategy.id, entry)
    void this.tick(strategy.id) // 立即跑一次
  }

  stop(id: number): void {
    const e = this.running.get(id)
    if (!e) return
    clearInterval(e.timer)
    this.running.delete(id)
  }

  stopAll(): void {
    for (const id of [...this.running.keys()]) this.stop(id)
  }

  /** 定时轮询：仅交易时段判定 */
  private async tick(id: number): Promise<void> {
    const e = this.running.get(id)
    if (!e) return
    if (!isTradingHoursFn(new Date(), this.calendar)) return
    await this.evaluateOnce(id, e)
  }

  /**
   * 手动触发一次判定（不受交易时段限制，用于非交易时段验证配置是否写对）。
   * 返回本次触发的信号（可能为空）。
   */
  async checkOnce(id: number): Promise<StrategySignal[]> {
    const e = this.running.get(id)
    if (!e) return []
    return this.evaluateOnce(id, e)
  }

  /** 拉一次实时价 → 更新当前 K 线 → 判定买卖点 → 触发则广播+落库+通知 */
  private async evaluateOnce(id: number, e: RunningEntry): Promise<StrategySignal[]> {
    const symbols = e.strategy.config.symbols
    if (symbols.length === 0) return []

    let quotes: Quote[]
    try {
      quotes = await this.provider.getQuotes(symbols)
    } catch (err) {
      console.error('[strategy] tick fetch failed:', err)
      return []
    }
    if (quotes.length === 0) return []

    const fired: StrategySignal[] = []
    const db = await getDb()
    for (const q of quotes) {
      const sym = q.symbol
      if (!e.bars.has(sym)) continue
      const bars = e.bars.get(sym)!
      // 按周期对齐到「当前这一根」：同一周期内只更新收盘价，绝不追加新 bar
      // （否则 5s 一次的实时价会被当成新 K 线，均线/RSI 立刻失真）
      const ts = bucketTs(q.timestamp || Date.now(), e.strategy.config.period)
      const last = bars[bars.length - 1]
      if (last && last.ts === ts) {
        last.price = q.price
        last.volume = q.volume ?? 0
        last.open = q.open || last.open
        last.high = q.high || last.high
        last.low = q.low || last.low
      } else if (!last || ts > last.ts) {
        bars.push({
          ts,
          price: q.price,
          volume: q.volume ?? 0,
          open: q.open || q.price,
          high: q.high || q.price,
          low: q.low || q.price,
        })
        if (bars.length > MAX_BARS) bars.shift()
      }

      const h = e.holding.get(sym) ?? null
      const res = evaluateSignal(bars, e.strategy.config, h)
      if (res.action === 'buy' && !h) {
        e.holding.set(sym, { entryPrice: q.price, entryTs: ts })
        const sig = makeSignal({
          strategyId: id,
          symbol: sym,
          action: 'buy',
          price: q.price,
          reason: res.reason ?? '入场条件触发',
        })
        this.emitSignal(db, sig)
        fired.push(sig)
      } else if (res.action === 'sell' && h) {
        e.holding.set(sym, null)
        const sig = makeSignal({
          strategyId: id,
          symbol: sym,
          action: 'sell',
          price: q.price,
          reason: res.reason ?? '出场条件触发',
        })
        this.emitSignal(db, sig)
        fired.push(sig)
      }
    }
    return fired
  }

  /** 冷启动序列：优先真实 K 线（前复权），不可用时退回本地轮询快照并按周期聚合 */
  private async loadInitialBars(
    db: Database,
    symbol: string,
    period: Strategy['config']['period']
  ): Promise<Bar[]> {
    try {
      const kl = await this.provider.getKLine(symbol, (period ?? 'day') as KLinePeriod, INIT_BARS)
      if (kl.length > 0) {
        return kl.map((k) => ({
          ts: bucketTs(k.ts, period),
          price: k.close,
          volume: k.volume,
          open: k.open,
          high: k.high,
          low: k.low,
        }))
      }
    } catch (err) {
      console.error(`[strategy] getKLine failed for ${symbol}: ${err}`)
    }
    // 兜底：本地快照（分钟级），按周期聚合成一根，避免把快照当独立 bar
    const points = getLatestQuoteHistory(db, symbol, INIT_BARS)
    const byBucket = new Map<number, Bar>()
    for (const p of points) {
      if (typeof p.price !== 'number') continue
      byBucket.set(bucketTs(p.ts, period), {
        ts: bucketTs(p.ts, period),
        price: p.price,
        volume: p.volume ?? 0,
        open: p.price,
        high: p.price,
        low: p.price,
      })
    }
    return [...byBucket.values()].sort((a, b) => a.ts - b.ts)
  }

  private emitSignal(db: Database, sig: StrategySignal): void {
    addSignal(db, sig)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.STRATEGY_SIGNAL, sig)
    }
    try {
      const actionText = sig.action === 'buy' ? '买入信号' : '卖出信号'
      new Notification({
        title: `策略买卖点 · ${sig.symbol}`,
        body: `${actionText} @ ${sig.price.toFixed(2)}（${sig.reason}）\n仅供参考，不构成投资建议`,
        silent: false,
      }).show()
    } catch (err) {
      console.error('[strategy] desktop notification failed:', err)
    }
  }
}
