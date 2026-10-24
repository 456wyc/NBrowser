import { useEffect, useState } from 'react'
import { IPC_CHANNELS, type TradingCalendarConfig } from '@shared/ipc'
import { DEFAULT_SEARCH_TEMPLATE, SEARCH_ENGINE_PRESETS } from '@shared/url'
import { setSearchEngineCache } from '../hooks/searchEngine'
import { useToast } from '../hooks/useToast'
import { QuoteSourceCard } from './QuoteSourceCard'

function parseDomains(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function AppSettingsPage() {
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [blacklist, setBlacklist] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()
  const [quoteInterval, setQuoteInterval] = useState({ tradingIntervalMs: 5000, nonTradingIntervalMs: 60000 })
  const [tradingSec, setTradingSec] = useState('5')
  const [nonTradingSec, setNonTradingSec] = useState('60')
  const [quoteSaving, setQuoteSaving] = useState(false)

  // 启动时恢复上次的标签页与独立窗口
  const [sessionRestore, setSessionRestore] = useState(true)

  // 交易日历
  const [calendar, setCalendar] = useState<TradingCalendarConfig>({ holidays: [], makeupWorkdays: [] })
  const [calendarDefault, setCalendarDefault] = useState<TradingCalendarConfig>({ holidays: [], makeupWorkdays: [] })
  const [calendarDraft, setCalendarDraft] = useState('')
  const [calendarSaving, setCalendarSaving] = useState(false)

  // 默认搜索引擎（存的是 URL 模板，%s 为搜索词占位符）
  const [searchTemplate, setSearchTemplate] = useState(DEFAULT_SEARCH_TEMPLATE)
  const [searchDraft, setSearchDraft] = useState(DEFAULT_SEARCH_TEMPLATE)
  const [searchSaving, setSearchSaving] = useState(false)
  const searchDirty = searchDraft !== searchTemplate
  const selectedPreset =
    SEARCH_ENGINE_PRESETS.find((p) => p.template === searchDraft)?.id ?? 'custom'

  useEffect(() => {
    ;(async () => {
      try {
        const [tracking, bl, cal, se, qi, sr] = await Promise.all([
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_TRACKING_ENABLED, {}),
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_BLACKLIST, {}),
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_TRADING_CALENDAR, {}),
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_SEARCH_ENGINE, {}),
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_QUOTE_INTERVAL, {}),
          window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_SESSION_RESTORE, {}),
        ])
        setTrackingEnabled(tracking.enabled)
        setSessionRestore(sr.enabled)
        setBlacklist(bl.domains)
        setDraft(bl.domains.join('\n'))
        setCalendar(cal.config)
        setCalendarDefault(cal.defaultConfig)
        setCalendarDraft(JSON.stringify(cal.config, null, 2))
        setSearchTemplate(se.template)
        setSearchDraft(se.template)
        setQuoteInterval({
          tradingIntervalMs: qi.tradingIntervalMs,
          nonTradingIntervalMs: qi.nonTradingIntervalMs,
        })
        setTradingSec(String(qi.tradingIntervalMs / 1000))
        setNonTradingSec(String(qi.nonTradingIntervalMs / 1000))
      } catch (err) {
        console.error('Failed to load settings:', err)
        showToast('读取设置失败，显示的可能不是当前值', false)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const toggleTracking = async () => {
    const next = !trackingEnabled
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_TRACKING_ENABLED, {
        enabled: next,
      })
      setTrackingEnabled(next)
      showToast(next ? '已开启轨迹记录' : '已关闭轨迹记录')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    }
  }

  const toggleSessionRestore = async () => {
    const next = !sessionRestore
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_SESSION_RESTORE, { enabled: next })
      setSessionRestore(next)
      showToast(next ? '下次启动会恢复上次的标签页与独立窗口' : '下次启动只开一个导航页')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    }
  }

  const saveBlacklist = async () => {
    setSaving(true)
    const domains = parseDomains(draft)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_BLACKLIST, { domains })
      setBlacklist(domains)
      showToast(`已保存 ${domains.length} 条域名`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  const saveSearchEngine = async () => {
    const template = searchDraft.trim()
    if (!template.includes('%s')) {
      showToast('搜索模板必须包含 %s 占位符', false)
      return
    }
    setSearchSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_SEARCH_ENGINE, { template })
      setSearchTemplate(template)
      // 同步渲染端缓存：地址栏建议与导航立即使用新引擎
      setSearchEngineCache(template)
      showToast('已更新默认搜索引擎')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSearchSaving(false)
    }
  }

  if (loading) return <div style={styles.loading}>加载中…</div>

  const dirty = parseDomains(draft).join('\n') !== blacklist.join('\n')

  // 交易日历：计算未来休市日、判断草稿是否有改动
  const upcoming = calendar.holidays
    .filter((d) => d >= new Date().toISOString().slice(0, 10))
    .sort()
    .slice(0, 12)
  const weekdayOf = (s: string): string => {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    return '周' + names[new Date(s + 'T00:00:00').getDay()]
  }
  let calendarDirty = false
  try {
    calendarDirty = JSON.stringify(JSON.parse(calendarDraft)) !== JSON.stringify(calendar)
  } catch {
    calendarDirty = false
  }

  const saveCalendar = async () => {
    setCalendarSaving(true)
    try {
      const parsed = JSON.parse(calendarDraft)
      if (
        !parsed ||
        !Array.isArray(parsed.holidays) ||
        !parsed.holidays.every((x: unknown) => typeof x === 'string') ||
        !Array.isArray(parsed.makeupWorkdays) ||
        !parsed.makeupWorkdays.every((x: unknown) => typeof x === 'string')
      ) {
        throw new Error('格式应为 {"holidays":[...],"makeupWorkdays":[...]}')
      }
      await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_TRADING_CALENDAR, { config: parsed })
      setCalendar(parsed)
      showToast('交易日历已保存')
    } catch (err) {
      showToast(err instanceof Error ? '保存失败：' + err.message : '保存失败', false)
    } finally {
      setCalendarSaving(false)
    }
  }

  // 行情刷新频率（秒 → 毫秒）
  const tradingMs = Math.round(Number(tradingSec) * 1000)
  const nonTradingMs = Math.round(Number(nonTradingSec) * 1000)
  const quoteValid =
    Number.isFinite(tradingMs) &&
    tradingMs >= 1000 &&
    tradingMs <= 600000 &&
    Number.isFinite(nonTradingMs) &&
    nonTradingMs >= 1000 &&
    nonTradingMs <= 600000
  const quoteDirty =
    quoteValid &&
    (tradingMs !== quoteInterval.tradingIntervalMs ||
      nonTradingMs !== quoteInterval.nonTradingIntervalMs)

  const saveQuoteInterval = async () => {
    if (!quoteValid) {
      showToast('刷新间隔需在 1 秒 ~ 600 秒之间', false)
      return
    }
    setQuoteSaving(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET_QUOTE_INTERVAL, {
        tradingIntervalMs: tradingMs,
        nonTradingIntervalMs: nonTradingMs,
      })
      setQuoteInterval({
        tradingIntervalMs: res.tradingIntervalMs,
        nonTradingIntervalMs: res.nonTradingIntervalMs,
      })
      setTradingSec(String(res.tradingIntervalMs / 1000))
      setNonTradingSec(String(res.nonTradingIntervalMs / 1000))
      showToast('已更新行情刷新频率')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setQuoteSaving(false)
    }
  }

  const resetCalendar = () => {
    setCalendar(calendarDefault)
    setCalendarDraft(JSON.stringify(calendarDefault, null, 2))
    showToast('已恢复默认，记得点保存')
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>设置</h2>

      {/* 轨迹记录 */}
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.rowText}>
            <div style={styles.rowTitle}>记录浏览轨迹</div>
            <div style={styles.rowDesc}>
              记录每个页面的标题、网址、停留时长与关联股票，用于复盘回顾
            </div>
          </div>
          <label className="switch" title={trackingEnabled ? '点击关闭' : '点击开启'}>
            <input type="checkbox" checked={trackingEnabled} onChange={() => toggleTracking()} />
            <span className="switch-track" />
          </label>
        </div>
      </div>

      {/* 启动恢复 */}
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.rowText}>
            <div style={styles.rowTitle}>启动时恢复上次会话</div>
            <div style={styles.rowDesc}>
              重开应用时自动还原上次打开的标签页，以及弹出的每个独立窗口（含它摆在哪块屏幕上）。
              页面内的滚动位置、未提交的表单不恢复
            </div>
          </div>
          <label className="switch" title={sessionRestore ? '点击关闭' : '点击开启'}>
            <input type="checkbox" checked={sessionRestore} onChange={() => toggleSessionRestore()} />
            <span className="switch-track" />
          </label>
        </div>
      </div>

      {/* 默认搜索引擎 */}
      <div style={styles.card}>
        <div style={styles.rowTitle}>默认搜索引擎</div>
        <div style={styles.rowDesc}>
          地址栏和首页搜索框输入文字时的搜索去向；选择预设或自定义含 %s 占位符的搜索链接
        </div>
        <div style={styles.cardActions}>
          <select
            className="field"
            value={selectedPreset}
            onChange={(e) => {
              const preset = SEARCH_ENGINE_PRESETS.find((p) => p.id === e.target.value)
              if (preset) setSearchDraft(preset.template)
            }}
          >
            {SEARCH_ENGINE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="custom">自定义…</option>
          </select>
          <input
            className="field"
            style={{ flex: 1, minWidth: 200 }}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="https://www.example.com/search?q=%s"
          />
          <button
            onClick={saveSearchEngine}
            disabled={searchSaving || !searchDirty}
            className="btn-primary"
          >
            {searchSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 行情数据源 */}
      <QuoteSourceCard />

      {/* 行情轮询频率 */}
      <div style={styles.card}>
        <div style={styles.rowTitle}>行情刷新频率</div>
        <div style={styles.rowDesc}>
          盯盘时每隔多久拉一次行情（交易时段可更密，非交易时段自动放宽以省流量）。范围 1
          秒 ~ 10 分钟，保存后立即生效，无需重启
        </div>
        <div style={styles.cardActions}>
          <label style={styles.inlineLabel}>
            交易时段（秒）
            <input
              className="field"
              type="number"
              min={1}
              max={600}
              style={{ width: 90 }}
              value={tradingSec}
              onChange={(e) => setTradingSec(e.target.value)}
            />
          </label>
          <label style={styles.inlineLabel}>
            非交易时段（秒）
            <input
              className="field"
              type="number"
              min={1}
              max={600}
              style={{ width: 90 }}
              value={nonTradingSec}
              onChange={(e) => setNonTradingSec(e.target.value)}
            />
          </label>
          <button
            onClick={saveQuoteInterval}
            disabled={quoteSaving || !quoteDirty}
            className="btn-primary"
          >
            {quoteSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 黑名单 */}
      <div style={styles.card}>
        <div style={styles.rowTitle}>不记录的域名</div>
        <div style={styles.rowDesc}>
          每行一个域名，其子域名自动包含。默认已内置常见券商交易域名
        </div>
        <textarea
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder={'trade.example.com\nclient.example.com'}
        />
        <div style={styles.cardActions}>
          <button
            onClick={saveBlacklist}
            disabled={saving || !dirty}
            className="btn-primary"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={() => setDraft(blacklist.join('\n'))}
            disabled={!dirty}
            className="btn"
          >
            撤销
          </button>
        </div>
      </div>

      {/* 交易日历 */}
      <div style={styles.card}>
        <div style={styles.rowTitle}>交易日历</div>
        <div style={styles.rowDesc}>
          行情轮询只在交易日（含调休补班）的交易时段进行。已内置 2025–2026 真实节假日，
          2027 公布后可在此补充。2027 之前的未列日期按「仅工作日」处理。
        </div>

        {upcoming.length > 0 ? (
          <div style={styles.holidayList}>
            {upcoming.map((d) => (
              <span key={d} style={styles.holidayTag}>
                {d} {weekdayOf(d)}
              </span>
            ))}
          </div>
        ) : (
          <div style={styles.rowDesc}>近期无已配置的休市日</div>
        )}

        <textarea
          className="textarea"
          value={calendarDraft}
          onChange={(e) => setCalendarDraft(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={'{\n  "holidays": ["2026-01-01"],\n  "makeupWorkdays": ["2026-01-04"]\n}'}
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        />
        <div style={styles.cardActions}>
          <button
            onClick={saveCalendar}
            disabled={calendarSaving || !calendarDirty}
            className="btn-primary"
          >
            {calendarSaving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={resetCalendar}
            className="btn"
          >
            恢复默认
          </button>
        </div>
      </div>

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginTop: 16 }}>{toast.text}</div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '16px 18px', width: '100%', boxSizing: 'border-box', color: 'var(--text)' },
  loading: { padding: 60, textAlign: 'center', color: 'var(--overlay0)' },
  title: { fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: 'var(--text)' },
  card: {
    padding: 14,
    marginBottom: 14,
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  },
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 },
  rowDesc: { fontSize: 12, color: 'var(--overlay0)', lineHeight: 1.6 },
  cardActions: { display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' },
  inlineLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--subtext0)',
    whiteSpace: 'nowrap',
  },
  holidayList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  holidayTag: {
    fontSize: 11,
    color: 'var(--subtext0)',
    background: 'var(--bg-crust)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 8px',
  },
}
