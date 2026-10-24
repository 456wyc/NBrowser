import { useEffect, useState } from 'react'
import { IPC_CHANNELS, type QuoteSourceInfo } from '@shared/ipc'
import { quoteSourceLabel } from '@shared/quote-source'
import { useToast } from '../hooks/useToast'

/**
 * 行情数据源设置卡片
 * - 内置：东方财富（默认）/ 腾讯财经（免费备用）
 * - 自定义：任意 HTTP JSON API（URL 模板 + 字段路径），可接 TickFlow 等商业数据源
 * - 保存即时生效；连续拉取失败会自动降级到东方财富保底
 */

const SOURCES: Array<{ id: string; label: string; hint: string }> = [
  { id: 'eastmoney', label: '东方财富（默认）', hint: '免费 · 无需 Key' },
  { id: 'tencent', label: '腾讯财经', hint: '免费 · 无需 Key · 备用源' },
  { id: 'custom', label: '自定义 HTTP API', hint: 'URL 模板 + 字段映射，可接 TickFlow 等' },
]

/** 字段路径输入项：key=Quote 字段名，label=界面标签 */
const FIELD_ITEMS: Array<{
  key: string
  label: string
  placeholder: string
  optional?: boolean
}> = [
  { key: 'code', label: '代码', placeholder: '如 code / symbol / secid', optional: true },
  { key: 'name', label: '名称', placeholder: '如 name', optional: true },
  { key: 'price', label: '现价', placeholder: '如 last / price / f2' },
  { key: 'changePercent', label: '涨跌幅(%)', placeholder: '如 pct_chg / f3' },
  { key: 'open', label: '今开', placeholder: '如 open', optional: true },
  { key: 'prevClose', label: '昨收', placeholder: '如 pre_close', optional: true },
  { key: 'high', label: '最高', placeholder: '如 high', optional: true },
  { key: 'low', label: '最低', placeholder: '如 low', optional: true },
  { key: 'volume', label: '成交量(手)', placeholder: '如 vol', optional: true },
  { key: 'amount', label: '成交额(元)', placeholder: '如 amt', optional: true },
]

const EMPTY_CUSTOM: NonNullable<QuoteSourceInfo['custom']> = {
  quoteUrl: '',
  fieldMap: {},
}

export function QuoteSourceCard() {
  const [provider, setProvider] = useState('eastmoney')
  const [custom, setCustom] = useState(EMPTY_CUSTOM)
  // 请求头用文本编辑（每行 key: value），与 custom 分开存，编辑时不必来回解析
  const [headersText, setHeadersText] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  // 实际生效的源（连续失败自动降级后与 provider 不同）
  const [active, setActive] = useState<string>('')
  const [degraded, setDegraded] = useState(false)
  const { toast, showToast } = useToast()

  const loadSource = async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.QUOTE_GET_SOURCE, {})
    setProvider(res.provider)
    setActive(res.active ?? '')
    setDegraded(Boolean(res.degraded))
    return res
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await loadSource()
        if (res.custom) {
          setCustom({
            quoteUrl: res.custom.quoteUrl,
            klineUrl: res.custom.klineUrl,
            quoteArrayPath: res.custom.quoteArrayPath,
            fieldMap: res.custom.fieldMap,
            headers: res.custom.headers,
          })
          setHeadersText(
            Object.entries(res.custom.headers || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          )
        }
      } catch (err) {
        showToast('读取行情数据源配置失败', false)
        console.error(err)
      }
    })()
  }, [])

  const isCustom = provider === 'custom'
  const customValid =
    custom.quoteUrl.trim().length > 0 && (custom.fieldMap.price || '').trim().length > 0

  const save = async () => {
    if (isCustom && !customValid) {
      showToast('自定义数据源至少需要填写行情 URL 与「现价」字段路径', false)
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.QUOTE_SET_SOURCE, {
        provider,
        custom: isCustom
          ? {
              quoteUrl: custom.quoteUrl.trim(),
              klineUrl: custom.klineUrl?.trim() || undefined,
              quoteArrayPath: custom.quoteArrayPath?.trim() || undefined,
              fieldMap: trimRecord(custom.fieldMap),
              headers: parseHeaders(headersText),
            }
          : undefined,
      })
      // 重新读一次：切换会清掉降级状态，测试也可能刚把它打回降级
      await loadSource().catch(() => {})
      showToast('已切换数据源，立即生效')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.QUOTE_TEST_SOURCE, {
        provider,
        custom: isCustom
          ? {
              quoteUrl: custom.quoteUrl.trim(),
              klineUrl: custom.klineUrl?.trim() || undefined,
              quoteArrayPath: custom.quoteArrayPath?.trim() || undefined,
              fieldMap: trimRecord(custom.fieldMap),
              headers: parseHeaders(headersText),
            }
          : undefined,
      })
      if (res.ok && res.sample) {
        setTestResult(
          `✓ ${res.sample.name}（${res.sample.symbol}） ${res.sample.price}  ${res.sample.changePercent >= 0 ? '+' : ''}${res.sample.changePercent}% · ${res.latencyMs}ms`
        )
      } else {
        setTestResult(`✗ ${res.error || '连接失败'}（${res.latencyMs}ms）`)
      }
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      await loadSource().catch(() => {})
      setTesting(false)
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.rowTitle}>行情数据源</div>
      <div style={styles.rowDesc}>
        自选股行情、走势回放、量化策略的数据来源。保存后立即生效，无需重启。
        连续拉取失败会自动降级到东方财富保底（顶部会出现「数据可能延迟」提示）。
      </div>

      <div style={styles.sourceRow}>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            className={'chip' + (provider === s.id ? ' chip-active' : '')}
            style={styles.sourceBtn}
            onClick={() => setProvider(s.id)}
            title={s.hint}
          >
            {s.label}
          </button>
        ))}
      </div>

      {degraded && provider !== 'eastmoney' && (
        <div style={styles.degraded}>
          ⚠️「{quoteSourceLabel(provider)}」连续拉取失败，已自动降级到「{quoteSourceLabel(active)}」保底；
          恢复后重新点一次「保存」即可切回。
        </div>
      )}

      {isCustom && (
        <div style={styles.customBox}>
          <div style={styles.hint}>
            适用任何返回 JSON 的 HTTP 行情接口（含需要 API Key 的商业源，如 TickFlow）。
            URL 模板占位符：<code style={styles.code}>{'{codes}'}</code>（逗号分隔的原始代码）、
            <code style={styles.code}>{'{code}'}</code>/{'{period}'}/{'{limit}'}（K 线用）。
            字段路径用点号（支持索引，如 <code style={styles.code}>data.list.0.last</code>）。
          </div>

          <label style={styles.label}>
            行情 URL *
            <input
              className="field"
              style={styles.input}
              value={custom.quoteUrl}
              onChange={(e) => setCustom({ ...custom, quoteUrl: e.target.value })}
              placeholder="https://api.example.com/quotes?codes={codes}"
            />
          </label>

          <label style={styles.label}>
            行情数组路径（留空自动探测）
            <input
              className="field"
              style={styles.input}
              value={custom.quoteArrayPath ?? ''}
              onChange={(e) => setCustom({ ...custom, quoteArrayPath: e.target.value })}
              placeholder="data.list"
            />
          </label>

          <div style={styles.label}>字段映射（点号路径）</div>
          <div style={styles.fieldGrid}>
            {FIELD_ITEMS.map((f) => (
              <label key={f.key} style={styles.fieldItem}>
                <span style={styles.fieldLabel}>
                  {f.label}
                  {f.optional ? '' : ' *'}
                </span>
                <input
                  className="field"
                  style={styles.input}
                  value={custom.fieldMap[f.key] ?? ''}
                  onChange={(e) =>
                    setCustom({ ...custom, fieldMap: { ...custom.fieldMap, [f.key]: e.target.value } })
                  }
                  placeholder={f.placeholder}
                />
              </label>
            ))}
          </div>

          <label style={styles.label}>
            K 线 URL（可选，留空则 K 线回退东财）
            <input
              className="field"
              style={styles.input}
              value={custom.klineUrl ?? ''}
              onChange={(e) => setCustom({ ...custom, klineUrl: e.target.value })}
              placeholder="https://api.example.com/kline?code={code}&period={period}&limit={limit}"
            />
          </label>

          <label style={styles.label}>
            请求头（每行一个，放 API Key）
            <textarea
              className="textarea"
              style={styles.input}
              rows={2}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder={'Authorization: Bearer xxx\nX-Api-Key: yyy'}
            />
          </label>
        </div>
      )}

      <div style={styles.cardActions}>
        <button onClick={test} disabled={testing || (isCustom && !customValid)} className="btn">
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? '保存中…' : '保存'}
        </button>
        {testResult && (
          <span style={testResult.startsWith('✓') ? styles.testOk : styles.testFail}>{testResult}</span>
        )}
      </div>
      {toast && <span className={toast.ok ? 'toast' : 'toast-error'}>{toast.text}</span>}
    </div>
  )
}

function trimRecord(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map || {})) {
    const t = (v || '').trim()
    if (t) out[k] = t
  }
  return out
}

/** 保存时把原始文本解析为对象（组件内 headers 暂存为文本） */
function parseHeaders(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'string') return raw as Record<string, string> | undefined
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (k && v) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: 14,
    marginBottom: 16,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  },
  rowTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 },
  rowDesc: { fontSize: 11.5, color: 'var(--overlay0)', lineHeight: 1.7, marginBottom: 10 },
  sourceRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  sourceBtn: { fontSize: 12 },
  degraded: {
    padding: '6px 10px',
    marginBottom: 10,
    fontSize: 11.5,
    lineHeight: 1.7,
    color: 'var(--yellow)',
    background: 'rgba(var(--yellow-rgb), 0.1)',
    borderRadius: 4,
  },
  customBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    background: 'var(--bg-crust)',
    borderRadius: 6,
    marginBottom: 10,
  },
  hint: { fontSize: 11, color: 'var(--overlay0)', lineHeight: 1.8 },
  code: {
    background: 'var(--surface0)',
    padding: '0 4px',
    borderRadius: 3,
    fontSize: 10.5,
    color: 'var(--blue)',
  },
  label: { fontSize: 12, color: 'var(--subtext0)', display: 'flex', flexDirection: 'column', gap: 4 },
  input: { width: '100%', fontSize: 12 },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 8,
  },
  fieldItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel: { fontSize: 11, color: 'var(--overlay0)' },
  cardActions: { display: 'flex', alignItems: 'center', gap: 10 },
  testOk: { fontSize: 12, color: 'var(--green)' },
  testFail: { fontSize: 12, color: 'var(--red)' },
}
