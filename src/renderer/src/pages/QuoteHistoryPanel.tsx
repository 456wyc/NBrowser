import { useState, useEffect, useMemo } from 'react'
import { IPC_CHANNELS, type QuoteHistoryPoint, type WatchlistItem } from '@shared/ipc'
import { ErrorState } from '../components/ErrorState'

const RANGES = [
  { label: '今日', days: 1 },
  { label: '近3日', days: 3 },
  { label: '近7日', days: 7 },
  { label: '近30日', days: 30 },
]

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Sparkline({ points }: { points: QuoteHistoryPoint[] }) {
  const W = 440
  const H = 220
  const P = 30
  const n = points.length
  const prices = points.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const span = max - min || 1

  const x = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : (i / (n - 1)) * (W - 2 * P))
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`)
    .join(' ')

  const up = prices[n - 1] >= prices[0]
  const color = up ? 'var(--up)' : 'var(--down)'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <line x1={P} y1={y(max)} x2={W - P} y2={y(max)} stroke="var(--border)" strokeDasharray="3 3" />
      <line x1={P} y1={y(min)} x2={W - P} y2={y(min)} stroke="var(--border)" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      {points.length <= 80 &&
        points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.price)} r={1.6} fill={color} />)}
      <text x={P} y={y(points[0].price) - 5} fill="var(--overlay0)" fontSize={10}>
        {points[0].price.toFixed(2)}
      </text>
      <text x={W - P} y={y(points[n - 1].price) - 5} fill="var(--overlay0)" fontSize={10} textAnchor="end">
        {points[n - 1].price.toFixed(2)}
      </text>
    </svg>
  )
}

export function QuoteHistoryPanel() {
  const [symbol, setSymbol] = useState('600519.SH')
  const [rangeDays, setRangeDays] = useState(1)
  const [history, setHistory] = useState<QuoteHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // 自选股列表：省得每次手敲代码（此前默认硬编码 600519.SH）
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])

  useEffect(() => {
    window.electronAPI
      .invoke(IPC_CHANNELS.WATCHLIST_GET_ALL, {})
      .then((res: { items: WatchlistItem[] }) => setWatchlist(res.items || []))
      .catch((err) => console.error('Failed to load watchlist for picker:', err))
  }, [])

  useEffect(() => {
    const sym = symbol.trim()
    if (!sym) {
      setHistory([])
      return
    }
    let cancelled = false
    setLoading(true)
    const fromTs = Date.now() - rangeDays * 86400000
    window.electronAPI
      .invoke(IPC_CHANNELS.QUOTE_HISTORY_GET, { symbol: sym, fromTs })
      .then((res: { history: QuoteHistoryPoint[] }) => {
        if (!cancelled) {
          setHistory(res.history)
          setError(null)
        }
      })
      .catch((err) => {
        console.error('Failed to load quote history:', err)
        if (!cancelled) {
          setHistory([])
          setError(err instanceof Error ? err.message : '读取行情历史失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [symbol, rangeDays, reloadKey])

  const stats = useMemo(() => {
    if (history.length === 0) return null
    const prices = history.map((h) => h.price)
    const first = prices[0]
    const last = prices[prices.length - 1]
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    const diff = last - first
    const pct = (diff / first) * 100
    return { first, last, high, low, diff, pct, samples: history.length }
  }, [history])

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <input
          className="field"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="股票代码，如 600519.SH"
        />
        <select
          className="field"
          style={{ maxWidth: 160 }}
          value={watchlist.some((i) => i.symbol === symbol) ? symbol : ''}
          onChange={(e) => e.target.value && setSymbol(e.target.value)}
          title="从自选股里选"
        >
          <option value="">自选股…</option>
          {watchlist.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.name || i.symbol}
            </option>
          ))}
        </select>
        <button
          className="icon-btn"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          title="重新加载"
        >
          ⟳
        </button>
        <div style={styles.ranges}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={rangeDays === r.days ? 'seg-btn active' : 'seg-btn'}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={styles.empty}>加载中...</div>
      ) : error ? (
        <ErrorState title="行情历史加载失败" desc={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : history.length === 0 ? (
        <div style={styles.empty}>
          <p>所选范围暂无行情历史</p>
          <p style={styles.hint}>
            行情仅在轮询（持仓自选股时）落库，需先在盯盘空间加入该股票并运行一段时间。
          </p>
        </div>
      ) : (
        <>
          <div style={styles.chartBox}>
            <Sparkline points={history} />
            <div style={styles.timeRow}>
              <span>{fmtTime(history[0].ts)}</span>
              <span>{fmtTime(history[history.length - 1].ts)}</span>
            </div>
          </div>

          {stats && (
            <div style={styles.stats}>
              <Stat label="样本中" value={`${stats.samples} 个`} />
              <Stat label="区间涨跌" value={`${stats.diff >= 0 ? '+' : ''}${stats.diff.toFixed(2)} (${stats.pct.toFixed(2)}%)`} color={stats.diff >= 0 ? 'var(--up)' : 'var(--down)'} />
              <Stat label="最高" value={stats.high.toFixed(2)} />
              <Stat label="最低" value={stats.low.toFixed(2)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.statItem}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  ranges: {
    display: 'flex',
    gap: 8,
  },
  chartBox: {
    background: 'var(--bg-base)',
    borderRadius: 8,
    padding: 12,
    border: '1px solid var(--border)',
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
    fontSize: 11,
    color: 'var(--overlay0)',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  statItem: {
    background: 'var(--bg-base)',
    borderRadius: 8,
    padding: '10px 12px',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--overlay0)',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 600,
  },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '60px 20px',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    opacity: 0.7,
    lineHeight: 1.6,
  },
}
