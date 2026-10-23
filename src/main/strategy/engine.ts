import type {
  StrategyCondition,
  StrategyRuleConfig,
  StrategySignal,
} from '@shared/ipc'

/**
 * 策略引擎（回测与实时运行共用同一套条件判定，保证「回测表现」与「运行信号」一致）。
 */

export interface Bar {
  ts: number
  price: number // 收盘价
  volume: number
  /** 开/高/低（真实 K 线有；轮询快照缺失时回退为收盘价） */
  open?: number
  high?: number
  low?: number
}

/** EMA 序列（首值取 SMA 作为种子） */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) {
      out.push(null)
      continue
    }
    if (prev == null) {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += values[j]
      prev = sum / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export interface MacdPoint {
  dif: number
  dea: number
}

/** MACD 序列：DIF = EMA(fast) - EMA(slow)，DEA = EMA(DIF, signal) */
export function macdSeries(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): (MacdPoint | null)[] {
  const ef = emaSeries(values, fast)
  const es = emaSeries(values, slow)
  const difs: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (ef[i] == null || es[i] == null) {
      difs.push(NaN)
    } else {
      difs.push((ef[i] as number) - (es[i] as number))
    }
  }
  // 对 DIF 的有效段再做一次 EMA 得到 DEA
  const deaRaw = emaSeries(difs.filter((d) => !Number.isNaN(d)), signal)
  const out: (MacdPoint | null)[] = []
  let idx = 0
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(difs[i])) {
      out.push(null)
    } else {
      const dea = deaRaw[idx] ?? null
      out.push(dea == null ? null : { dif: difs[i], dea })
      idx++
    }
  }
  return out
}

export interface KdjPoint {
  k: number
  d: number
  j: number
}

/** KDJ 序列（默认 9,3,3）：RSV 用 N 日最高/最低，K/D 递推 */
export function kdjSeries(bars: Bar[], n = 9): (KdjPoint | null)[] {
  const out: (KdjPoint | null)[] = []
  let k = 50
  let d = 50
  for (let i = 0; i < bars.length; i++) {
    if (i + 1 < n) {
      out.push(null)
      continue
    }
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - n + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j].high ?? bars[j].price)
      ll = Math.min(ll, bars[j].low ?? bars[j].price)
    }
    const c = bars[i].price
    const rsv = hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100
    k = (2 / 3) * k + (1 / 3) * rsv
    d = (2 / 3) * d + (1 / 3) * k
    out.push({ k, d, j: 3 * k - 2 * d })
  }
  return out
}

export interface BollPoint {
  mid: number
  upper: number
  lower: number
}

/** 布林带：中轨 MA(period)，上下轨 ± mult × 标准差 */
export function boll(values: number[], period = 20, mult = 2, i = values.length - 1): BollPoint | null {
  const mid = ma(values, period, i)
  if (mid == null) return null
  let sum = 0
  for (let k = i - period + 1; k <= i; k++) sum += (values[k] - mid) ** 2
  const sd = Math.sqrt(sum / period)
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd }
}

export function ma(values: number[], period: number, i: number): number | null {
  if (i + 1 < period) return null
  let sum = 0
  for (let k = i - period + 1; k <= i; k++) sum += values[k]
  return sum / period
}

export function rsi(values: number[], period: number, i: number): number | null {
  if (i + 1 < period) return null
  let gains = 0
  let losses = 0
  for (let k = i - period + 1; k <= i; k++) {
    const diff = values[k] - values[k - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

/** 判定单个条件在某根 K 线（索引 i）是否成立 */
export function evalCondition(
  cond: StrategyCondition,
  prices: number[],
  volumes: number[],
  i: number,
  bars?: Bar[]
): boolean {
  switch (cond.type) {
    case 'ma_cross': {
      const fast = ma(prices, cond.fast ?? 5, i)
      const fastPrev = ma(prices, cond.fast ?? 5, i - 1)
      const slow = ma(prices, cond.slow ?? 20, i)
      const slowPrev = ma(prices, cond.slow ?? 20, i - 1)
      if (fast == null || slow == null || fastPrev == null || slowPrev == null) return false
      const nowCross = cond.direction === 'golden' ? fast > slow : fast < slow
      const prevCross = cond.direction === 'golden' ? fastPrev <= slowPrev : fastPrev >= slowPrev
      return nowCross && prevCross
    }
    case 'price_cross_ma': {
      const m = ma(prices, cond.maPeriod ?? 20, i)
      const mPrev = ma(prices, cond.maPeriod ?? 20, i - 1)
      if (m == null || mPrev == null) return false
      const now = cond.direction === 'above' ? prices[i] > m : prices[i] < m
      const prev = cond.direction === 'above' ? prices[i - 1] <= mPrev : prices[i - 1] >= mPrev
      return now && prev
    }
    case 'price_breakout': {
      const lb = cond.lookback ?? 20
      if (i < lb) return false
      const window = prices.slice(i - lb, i)
      const ref = cond.direction === 'break_high' ? Math.max(...window) : Math.min(...window)
      return cond.direction === 'break_high' ? prices[i] > ref : prices[i] < ref
    }
    case 'rsi': {
      const r = rsi(prices, 14, i)
      if (r == null) return false
      return cond.direction === 'overbought'
        ? r >= (cond.threshold ?? 70)
        : r <= (cond.threshold ?? 30)
    }
    case 'volume_surge': {
      const lb = 20
      if (i < lb || volumes[i] <= 0) return false
      const avg = volumes.slice(i - lb, i).reduce((a, b) => a + b, 0) / lb
      return avg > 0 && volumes[i] >= avg * (cond.threshold ?? 2)
    }
    case 'volume_shrink': {
      const lb = 20
      if (i < lb || volumes[i] <= 0) return false
      const avg = volumes.slice(i - lb, i).reduce((a, b) => a + b, 0) / lb
      return avg > 0 && volumes[i] <= avg * (cond.threshold ?? 0.5)
    }
    case 'macd_cross': {
      const series = macdSeries(prices, cond.fast ?? 12, cond.slow ?? 26, cond.signalPeriod ?? 9)
      const now = series[i]
      const prev = series[i - 1]
      if (!now || !prev) return false
      return cond.direction === 'golden'
        ? now.dif > now.dea && prev.dif <= prev.dea
        : now.dif < now.dea && prev.dif >= prev.dea
    }
    case 'kdj_cross': {
      const src: Bar[] = bars ?? prices.map((p, idx) => ({ ts: idx, price: p, volume: volumes[idx] ?? 0 }))
      const series = kdjSeries(src, 9)
      const now = series[i]
      const prev = series[i - 1]
      if (!now || !prev) return false
      return cond.direction === 'golden'
        ? now.k > now.d && prev.k <= prev.d
        : now.k < now.d && prev.k >= prev.d
    }
    case 'boll': {
      const b = boll(prices, cond.bollPeriod ?? 20, cond.mult ?? 2, i)
      if (!b) return false
      return cond.direction === 'break_upper' ? prices[i] > b.upper : prices[i] < b.lower
    }
    case 'change_pct': {
      if (i < 1 || prices[i - 1] <= 0) return false
      const pct = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100
      return cond.direction === 'up'
        ? pct >= (cond.threshold ?? 3)
        : pct <= -(cond.threshold ?? 3)
    }
    case 'consecutive': {
      // 用「收盘价 vs 前一日收盘价」判断，避免依赖开盘价（轮询快照没有 open，否则会误判）
      const days = cond.days ?? 3
      if (i < days) return false
      for (let k = i - days + 1; k <= i; k++) {
        if (k < 1) return false
        const up = prices[k] > prices[k - 1]
        if (cond.direction === 'up' ? !up : up) return false
      }
      return true
    }
    case 'ma_alignment': {
      const fast = cond.fast ?? 5
      const slow = cond.slow ?? 20
      const mid = Math.round((fast + slow) / 2)
      const mf = ma(prices, fast, i)
      const mm = ma(prices, mid, i)
      const ms = ma(prices, slow, i)
      if (mf == null || mm == null || ms == null) return false
      return cond.direction === 'bull' ? mf > mm && mm > ms : mf < mm && mm < ms
    }
    default:
      return false
  }
}

export function groupHold(
  conds: StrategyCondition[],
  logic: 'and' | 'or',
  prices: number[],
  volumes: number[],
  i: number,
  bars?: Bar[]
): boolean {
  if (conds.length === 0) return false
  const results = conds.map((c) => evalCondition(c, prices, volumes, i, bars))
  return logic === 'and' ? results.every(Boolean) : results.some(Boolean)
}

export interface Holding {
  entryPrice: number
  entryTs: number
}

export interface SignalResult {
  action: 'buy' | 'sell' | null
  reason?: string
}

/**
 * 判定「最新一根 bar」是否触发买卖信号。
 * - 未持仓且入场条件成立 → 买入
 * - 持仓且风控（止损/止盈）或出场条件成立 → 卖出（reason 区分止损/止盈/出场）
 */
export function evaluateSignal(
  bars: Bar[],
  config: StrategyRuleConfig,
  holding: Holding | null
): SignalResult {
  const n = bars.length
  if (n < 2) return { action: null }
  const i = n - 1
  const prices = bars.map((b) => b.price)
  const volumes = bars.map((b) => b.volume)

  if (!holding) {
    if (groupHold(config.entry.conditions, config.entry.logic, prices, volumes, i, bars)) {
      return { action: 'buy', reason: '入场条件触发' }
    }
    return { action: null }
  }

  const ret = (prices[i] - holding.entryPrice) / holding.entryPrice
  const sl = config.risk.stopLossPct ?? 0
  const tp = config.risk.takeProfitPct ?? 0
  let reason: string | null = null
  if (sl > 0 && ret <= -sl / 100) reason = '止损'
  else if (tp > 0 && ret >= tp / 100) reason = '止盈'
  else if (groupHold(config.exit.conditions, config.exit.logic, prices, volumes, i, bars))
    reason = '出场条件'

  if (reason) return { action: 'sell', reason }
  return { action: null }
}

/** 构造一条信号记录（落库 / 推送共用） */
export function makeSignal(
  partial: Omit<StrategySignal, 'id' | 'ts'> & { ts?: number }
): StrategySignal {
  return {
    id: 0,
    ts: partial.ts ?? Date.now(),
    strategyId: partial.strategyId,
    symbol: partial.symbol,
    action: partial.action,
    price: partial.price,
    reason: partial.reason,
  }
}
