import { useEffect, useMemo, useState } from 'react'
import {
  IPC_CHANNELS,
  type TradeWithReview,
  type ReviewNote,
  type TradeSide,
  type ParsedTrade,
  type TradesImportParseResponse,
} from '@shared/ipc'
import { computePortfolio, unrealizedPnl } from '@shared/pnl'
import { useQuotes } from '../hooks/useQuotes'
import { useToast } from '../hooks/useToast'
import { ErrorState } from '../components/ErrorState'

interface DraftTrade {
  symbol: string
  name: string
  side: TradeSide
  price: string
  quantity: string
  fee: string
  tradedAtLocal: string
  reason: string
}

const EMPTY_DRAFT: DraftTrade = {
  symbol: '',
  name: '',
  side: 'buy',
  price: '',
  quantity: '',
  fee: '',
  tradedAtLocal: nowLocalInput(),
  reason: '',
}

/** 时间戳 → <input type="datetime-local"> 需要的本地时间字符串 */
function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowLocalInput(): string {
  return toLocalInput(Date.now())
}

type TradeRange = 'all' | '7d' | '30d' | 'year'
/** 来源：all=不限 / manual=手工记录 / broker_import=券商交割单导入 */
type TradeSource = 'all' | 'manual' | 'broker_import'

const RANGE_OPTIONS: Array<{ value: TradeRange; label: string }> = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'year', label: '近一年' },
]

/** 时间范围 → 起始时间戳（0 表示不限） */
function rangeFrom(range: TradeRange): number {
  if (range === 'all') return 0
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 365
  return Date.now() - days * 24 * 60 * 60 * 1000
}

const SOURCE_OPTIONS: Array<{ value: TradeSource; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'manual', label: '手工记录' },
  { value: 'broker_import', label: '交割单导入' },
]

export function TradesPanel() {
  const [items, setItems] = useState<TradeWithReview[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<DraftTrade>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 券商交割单导入
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<TradesImportParseResponse | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // 列表筛选（FR-10.6：按代码/名称关键字 + 时间范围）
  const [keyword, setKeyword] = useState('')
  const [range, setRange] = useState<TradeRange>('all')
  const [source, setSource] = useState<TradeSource>('all')

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const from = rangeFrom(range)
    return items.filter(({ trade }) => {
      if (from > 0 && trade.traded_at < from) return false
      if (source !== 'all' && trade.source !== source) return false
      if (!q) return true
      return (
        trade.symbol.toLowerCase().includes(q) || trade.name.toLowerCase().includes(q)
      )
    })
  }, [items, keyword, range, source])

  const { quotes } = useQuotes()
  // 汇总跟随筛选结果，便于单独看某只股票/某段时间的盈亏
  const summary = useMemo(
    () => computePortfolio(filtered.map((i) => i.trade)),
    [filtered]
  )

  const load = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.TRADES_GET_ALL, {})
      setItems(res.items)
      setLoadError(null)
    } catch (err) {
      console.error('Failed to load trades:', err)
      setLoadError(err instanceof Error ? err.message : '读取交易记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = Number(draft.price)
    const quantity = Number(draft.quantity)

    if (!draft.symbol.trim() || !draft.name.trim()) {
      showToast('请填写代码和名称', false)
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      showToast('价格必须是正数', false)
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      showToast('数量必须是正整数', false)
      return
    }

    const tradedAt = draft.tradedAtLocal
      ? new Date(draft.tradedAtLocal).getTime()
      : Date.now()
    if (!Number.isFinite(tradedAt)) {
      showToast('成交时间无效', false)
      return
    }

    setSaving(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.TRADES_ADD, {
        symbol: draft.symbol.trim(),
        name: draft.name.trim(),
        side: draft.side,
        price,
        quantity,
        traded_at: tradedAt,
        fee: draft.fee ? Number(draft.fee) : 0,
        ...(draft.side === 'buy'
          ? { buy_reason: draft.reason.trim() }
          : { sell_reason: draft.reason.trim() }),
      })

      if (!res.trade) {
        showToast('已存在完全相同的交易记录', false)
      } else {
        showToast('已记录')
        setDraft({ ...EMPTY_DRAFT, tradedAtLocal: nowLocalInput() })
        setShowForm(false)
        await load()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('确定删除这条交易记录吗？关联的复盘笔记也会一并删除。')) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.TRADES_DELETE, { id })
      await load()
    } catch (err) {
      console.error('Failed to delete trade:', err)
    }
  }

  // ---------- 券商交割单导入 ----------
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImportText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  const handleParse = async () => {
    if (!importText.trim()) {
      setImportErr('请先选择文件或粘贴交割单文本')
      return
    }
    setImporting(true)
    setImportErr(null)
    setPreview(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.TRADES_IMPORT_PARSE, {
        text: importText,
      })
      setPreview(res)
      setSelected(new Set(res.trades.map((_, i) => i)))
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : '解析失败')
    } finally {
      setImporting(false)
    }
  }

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleConfirmImport = async () => {
    if (!preview) return
    const trades = preview.trades.filter((_, i) => selected.has(i))
    if (trades.length === 0) {
      setImportErr('请至少选择一条成交')
      return
    }
    setImporting(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.TRADES_IMPORT_BULK, { trades })
      showToast(`已导入 ${res.inserted} 条，跳过重复 ${res.skipped} 条`)
      setShowImport(false)
      setPreview(null)
      setImportText('')
      await load()
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <div style={styles.loading}>加载中…</div>

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>交易记录</h2>
        <div style={styles.headerActions}>
          <button onClick={() => setShowImport(!showImport)} className="btn">
            {showImport ? '关闭导入' : '导入交割单'}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn">
            {showForm ? '取消' : '+ 记一笔'}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={styles.filterRow}>
          <input
            className="field"
            style={styles.fieldGrow}
            placeholder="筛选代码 / 名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select
            className="field"
            value={range}
            onChange={(e) => setRange(e.target.value as TradeRange)}
            title="按成交时间筛选"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className="field"
            value={source}
            onChange={(e) => setSource(e.target.value as TradeSource)}
            title="按记录来源筛选"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {summary.positions.length > 0 && (
        <PortfolioOverview
          summary={summary}
          currentPriceOf={(symbol) => quotes.get(symbol)?.price ?? 0}
        />
      )}

      {showForm && (
        <form onSubmit={submit} style={styles.form}>
          <div style={styles.formRow}>
            <input
              className="field"
              style={styles.fieldGrow}
              placeholder="代码 如 600519"
              value={draft.symbol}
              onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
            />
            <input
              className="field"
              style={styles.fieldGrow}
              placeholder="名称"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div style={styles.sideRow}>
            {(['buy', 'sell'] as TradeSide[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft({ ...draft, side: s })}
                style={{
                  ...styles.sideBtn,
                  ...(draft.side === s
                    ? s === 'buy'
                      ? styles.sideBtnBuyActive
                      : styles.sideBtnSellActive
                    : {}),
                }}
              >
                {s === 'buy' ? '买入' : '卖出'}
              </button>
            ))}
          </div>

          <div style={styles.formRow}>
            <input
              className="field"
              style={styles.fieldGrow}
              placeholder="价格"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
            <input
              className="field"
              style={styles.fieldGrow}
              placeholder="数量(股)"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            />
            <input
              className="field"
              style={styles.fieldGrow}
              placeholder="手续费"
              value={draft.fee}
              onChange={(e) => setDraft({ ...draft, fee: e.target.value })}
            />
          </div>

          <input
            type="datetime-local"
            className="field"
            style={styles.datetimeField}
            value={draft.tradedAtLocal}
            onChange={(e) => setDraft({ ...draft, tradedAtLocal: e.target.value })}
          />

          <input
            className="field"
            style={styles.blockField}
            placeholder={draft.side === 'buy' ? '买入理由' : '卖出理由'}
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />

          <button type="submit" disabled={saving} className="btn-primary" style={styles.blockBtn}>
            {saving ? '保存中…' : '保存'}
          </button>
        </form>
      )}

      {showImport && (
        <div style={styles.importBox}>
          <div style={styles.importHint}>
            支持券商导出的 <b>CSV 交割单</b>（通用表头自动识别），或直接<b>粘贴网页复制的交割单文本</b>（将用大模型解析）。
          </div>
          <div style={styles.formRow}>
            <label style={styles.fileBtn}>
              选择文件
              <input type="file" accept=".csv,.txt,.html,.json" onChange={handleFile} style={{ display: 'none' }} />
            </label>
            <button onClick={handleParse} disabled={importing} className="btn-primary" style={styles.blockBtn}>
              {importing ? '解析中…' : '解析'}
            </button>
          </div>
          <textarea
            className="textarea"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="在此粘贴交割单文本（CSV 或网页内容）…"
            rows={5}
          />

          {importErr && <div className="toast-error">{importErr}</div>}

          {preview && (
            <div style={styles.preview}>
              <div style={styles.previewHead}>
                <span>
                  解析方式：{preview.method === 'llm' ? '大模型' : '表头识别'} ｜ 共 {preview.trades.length} 条
                  {preview.unmatched.length > 0 && ` ｜ 未识别列：${preview.unmatched.join('、')}`}
                </span>
                {preview.trades.length > 0 && (
                  <button onClick={handleConfirmImport} disabled={importing} className="btn-primary" style={styles.blockBtn}>
                    {importing ? '导入中…' : `导入选中 (${selected.size})`}
                  </button>
                )}
              </div>
              {preview.warnings.length > 0 && (
                <div style={styles.previewWarn}>{preview.warnings.slice(0, 3).join('；')}</div>
              )}
              {preview.trades.length === 0 ? (
                <div style={styles.emptyHint}>未能解析出成交记录，请检查文本格式或补充表头。</div>
              ) : (
                <div style={styles.previewTable}>
                  <div style={styles.previewRowHead}>
                    <span />
                    <span>代码</span>
                    <span>名称</span>
                    <span>方向</span>
                    <span>价格</span>
                    <span>数量</span>
                    <span>手续费</span>
                    <span>时间</span>
                  </div>
                  {preview.trades.map((t: ParsedTrade, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.previewRow,
                        ...(selected.has(i) ? styles.previewRowSel : {}),
                      }}
                      onClick={() => toggleSelect(i)}
                    >
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleSelect(i)}
                      />
                      <span>{t.symbol}</span>
                      <span>{t.name || '—'}</span>
                      <span style={{ color: t.side === 'buy' ? 'var(--up)' : 'var(--down)' }}>
                        {t.side === 'buy' ? '买' : '卖'}
                      </span>
                      <span>{t.price.toFixed(2)}</span>
                      <span>{t.quantity}</span>
                      <span>{t.fee.toFixed(2)}</span>
                      <span>{formatTime(t.tradedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 10 }}>{toast.text}</div>
      )}

      {loadError ? (
        <ErrorState title="交易记录加载失败" desc={loadError} onRetry={load} />
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <div>还没有交易记录</div>
          <div style={styles.emptyHint}>记下每笔买卖和当时的理由，复盘时才能对照</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <div>没有符合条件的交易</div>
          <div style={styles.emptyHint}>换个关键字或放宽时间范围试试</div>
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map(({ trade, review }) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              review={review}
              expanded={expandedId === trade.id}
              onToggle={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
              onSaved={load}
              onDelete={() => remove(trade.id)}
              onNotify={showToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface PortfolioOverviewProps {
  summary: ReturnType<typeof computePortfolio>
  currentPriceOf: (symbol: string) => number
}

function PortfolioOverview({ summary, currentPriceOf }: PortfolioOverviewProps) {
  const pnl = summary.totalRealizedPnl
  const holdingPositions = summary.positions.filter((p) => p.quantity > 0)

  return (
    <div style={styles.overview}>
      <div style={styles.overviewTop}>
        <div style={styles.overviewMain}>
          <div style={styles.overviewLabel}>已实现盈亏</div>
          <div style={{ ...styles.overviewValue, color: pnlColor(pnl) }}>
            {pnl >= 0 ? '+' : ''}
            {pnl.toFixed(2)}
          </div>
        </div>
        <div style={styles.overviewMetrics}>
          <div style={styles.metric}>
            <span style={styles.metricLabel}>手续费</span>
            <span style={styles.metricValue}>{summary.totalFee.toFixed(2)}</span>
          </div>
          <div style={styles.metric}>
            <span style={styles.metricLabel}>胜率</span>
            <span style={styles.metricValue}>
              {summary.sells.length > 0
                ? `${Math.round(summary.winRate * 100)}% (${summary.winCount}/${summary.sells.length})`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {holdingPositions.length > 0 && (
        <div style={styles.holdings}>
          {holdingPositions.map((pos) => {
            const price = currentPriceOf(pos.symbol)
            const floating = unrealizedPnl(pos, price)
            return (
              <div key={pos.symbol} style={styles.holdingRow}>
                <div style={styles.holdingNameArea}>
                  <span style={styles.holdingName}>{pos.name}</span>
                  <span style={styles.holdingSymbol}>{pos.symbol}</span>
                </div>
                <div style={styles.holdingNums}>
                  <span style={styles.holdingQty}>
                    {pos.quantity} @ {pos.avgCost.toFixed(2)}
                  </span>
                  {price > 0 && (
                    <span style={{ ...styles.holdingPnl, color: pnlColor(floating) }}>
                      浮动 {floating >= 0 ? '+' : ''}
                      {floating.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function pnlColor(value: number): string {
  if (value > 0) return 'var(--up)' // A 股习惯：赚为红
  if (value < 0) return 'var(--down)'
  return 'var(--subtext0)'
}

interface TradeCardProps {
  trade: TradeWithReview['trade']
  review: ReviewNote | null
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
  onDelete: () => void
  onNotify: (text: string, ok?: boolean) => void
}

function TradeCard({
  trade,
  review,
  expanded,
  onToggle,
  onSaved,
  onDelete,
  onNotify,
}: TradeCardProps) {
  const [valid, setValid] = useState<number | null>(review?.was_reason_valid ?? null)
  const [didWell, setDidWell] = useState(review?.did_well ?? '')
  const [didWrong, setDidWrong] = useState(review?.did_wrong ?? '')
  const [nextTime, setNextTime] = useState(review?.next_time ?? '')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // 展开时以服务端最新数据为准
  useEffect(() => {
    if (expanded) {
      setValid(review?.was_reason_valid ?? null)
      setDidWell(review?.did_well ?? '')
      setDidWrong(review?.did_wrong ?? '')
      setNextTime(review?.next_time ?? '')
    }
  }, [expanded, review])

  const save = async () => {
    setSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.REVIEWS_SAVE, {
        tradeId: trade.id,
        was_reason_valid: valid,
        did_well: didWell.trim() || null,
        did_wrong: didWrong.trim() || null,
        next_time: nextTime.trim() || null,
      })
      onNotify(hasReview ? '复盘已更新' : '复盘已保存')
      onSaved()
    } catch (err) {
      console.error('Failed to save review:', err)
      onNotify('保存复盘失败：' + (err instanceof Error ? err.message : String(err)), false)
    } finally {
      setSaving(false)
    }
  }

  // 只清掉复盘笔记，保留交易本身（此前只能连交易一起删）
  const removeReview = async () => {
    if (!hasReview) return
    if (!confirm('确定清空这条交易的复盘笔记吗？交易记录会保留。')) return
    setSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.REVIEWS_DELETE, { tradeId: trade.id })
      setValid(null)
      setDidWell('')
      setDidWrong('')
      setNextTime('')
      onNotify('复盘笔记已清空')
      onSaved()
    } catch (err) {
      console.error('Failed to delete review:', err)
      onNotify('清空笔记失败：' + (err instanceof Error ? err.message : String(err)), false)
    } finally {
      setSaving(false)
    }
  }

  const reason = trade.side === 'buy' ? trade.buy_reason : trade.sell_reason
  const hasReview = Boolean(review)

  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span
          style={{
            ...styles.sideTag,
            ...(trade.side === 'buy' ? styles.sideTagBuy : styles.sideTagSell),
          }}
        >
          {trade.side === 'buy' ? '买入' : '卖出'}
        </span>
        <div style={styles.cardTitleArea}>
          <span style={styles.cardName}>{trade.name}</span>
          <span style={styles.cardSymbol}>{trade.symbol}</span>
        </div>
        <div style={styles.cardMetrics}>
          <span>{trade.price.toFixed(2)}</span>
          <span style={styles.cardQty}>× {trade.quantity}</span>
        </div>
        <span style={styles.cardTime}>{formatTime(trade.traded_at)}</span>
        {trade.source === 'broker_import' && (
          <span style={styles.sourceTag} title={`来源：${trade.source}`}>
            导入
          </span>
        )}
        <button
          onClick={() => {
            setEditing(true)
            if (!expanded) onToggle()
          }}
          style={{ ...styles.cardBtn, ...(editing ? styles.cardBtnActive : {}) }}
          title="编辑这笔交易"
        >
          ✎
        </button>
        <button onClick={onToggle} style={styles.cardBtn} title="复盘">
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {reason && <div style={styles.reason}>理由：{reason}</div>}

      {expanded && (
        <div style={styles.reviewBox}>
          {editing ? (
            <TradeEditForm
              trade={trade}
              onCancel={() => setEditing(false)}
              onNotify={onNotify}
              onSaved={() => {
                setEditing(false)
                onSaved()
              }}
            />
          ) : (
            <>
          <div style={styles.reviewQ}>当时的理由成立吗？</div>
          <div style={styles.sideRow}>
            {[
              { v: 1, label: '成立' },
              { v: 0, label: '不成立' },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setValid(valid === opt.v ? null : opt.v)}
                style={{
                  ...styles.sideBtn,
                  ...(valid === opt.v ? styles.sideBtnBuyActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            className="textarea"
            placeholder="做对了什么"
            value={didWell}
            onChange={(e) => setDidWell(e.target.value)}
            rows={2}
          />
          <textarea
            className="textarea"
            placeholder="做错了什么"
            value={didWrong}
            onChange={(e) => setDidWrong(e.target.value)}
            rows={2}
          />
          <textarea
            className="textarea"
            placeholder="下次怎么办"
            value={nextTime}
            onChange={(e) => setNextTime(e.target.value)}
            rows={2}
          />

          <div style={styles.reviewActions}>
            <button onClick={save} disabled={saving} className="btn-primary" style={styles.growBtn}>
              {saving ? '保存中…' : hasReview ? '更新复盘' : '保存复盘'}
            </button>
            <button onClick={onDelete} className="btn btn-danger">
              删除交易
            </button>
            {hasReview && (
              <button onClick={removeReview} disabled={saving} className="btn" title="只清笔记，保留交易">
                清空笔记
              </button>
            )}
          </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface TradeEditFormProps {
  trade: TradeWithReview['trade']
  onCancel: () => void
  onSaved: () => void
  onNotify: (text: string, ok?: boolean) => void
}

/** 就地修改一笔成交（后端 trades:update 已就绪，此前 UI 没有入口） */
function TradeEditForm({ trade, onCancel, onSaved, onNotify }: TradeEditFormProps) {
  const [symbol, setSymbol] = useState(trade.symbol)
  const [name, setName] = useState(trade.name)
  const [side, setSide] = useState<TradeSide>(trade.side)
  const [price, setPrice] = useState(String(trade.price))
  const [quantity, setQuantity] = useState(String(trade.quantity))
  const [fee, setFee] = useState(String(trade.fee ?? 0))
  const [tradedAtLocal, setTradedAtLocal] = useState(toLocalInput(trade.traded_at))
  const [reason, setReason] = useState(
    trade.side === 'buy' ? trade.buy_reason ?? '' : trade.sell_reason ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = Number(price)
    const q = Number(quantity)

    if (!symbol.trim() || !name.trim()) {
      setErr('请填写代码和名称')
      return
    }
    if (!Number.isFinite(p) || p <= 0) {
      setErr('价格必须是正数')
      return
    }
    if (!Number.isInteger(q) || q <= 0) {
      setErr('数量必须是正整数')
      return
    }
    const tradedAt = tradedAtLocal ? new Date(tradedAtLocal).getTime() : trade.traded_at
    if (!Number.isFinite(tradedAt)) {
      setErr('成交时间无效')
      return
    }

    setSaving(true)
    setErr(null)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.TRADES_UPDATE, {
        id: trade.id,
        symbol: symbol.trim(),
        name: name.trim(),
        side,
        price: p,
        quantity: q,
        traded_at: tradedAt,
        fee: fee ? Number(fee) : 0,
        // 方向改了就把另一侧理由清空，避免卖出记录上还挂着买入理由
        ...(side === 'buy'
          ? { buy_reason: reason.trim() || null, sell_reason: null }
          : { sell_reason: reason.trim() || null, buy_reason: null }),
      })
      onNotify('已更新这笔交易')
      onSaved()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div style={styles.formRow}>
        <input
          className="field"
          style={styles.fieldGrow}
          placeholder="代码 如 600519"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <input
          className="field"
          style={styles.fieldGrow}
          placeholder="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={{ ...styles.sideRow, marginTop: 8 }}>
        {(['buy', 'sell'] as TradeSide[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            style={{
              ...styles.sideBtn,
              ...(side === s
                ? s === 'buy'
                  ? styles.sideBtnBuyActive
                  : styles.sideBtnSellActive
                : {}),
            }}
          >
            {s === 'buy' ? '买入' : '卖出'}
          </button>
        ))}
      </div>

      <div style={{ ...styles.formRow, marginTop: 8 }}>
        <input
          className="field"
          style={styles.fieldGrow}
          placeholder="价格"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="field"
          style={styles.fieldGrow}
          placeholder="数量(股)"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input
          className="field"
          style={styles.fieldGrow}
          placeholder="手续费"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </div>

      <input
        type="datetime-local"
        className="field"
        style={{ ...styles.datetimeField, marginTop: 8 }}
        value={tradedAtLocal}
        onChange={(e) => setTradedAtLocal(e.target.value)}
      />

      <input
        className="field"
        style={{ ...styles.blockField, marginTop: 8 }}
        placeholder={side === 'buy' ? '买入理由' : '卖出理由'}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {err && (
        <div className="toast-error" style={{ marginTop: 8 }}>
          {err}
        </div>
      )}

      <div style={{ ...styles.reviewActions, marginTop: 10 }}>
        <button type="submit" disabled={saving} className="btn-primary" style={styles.growBtn}>
          {saving ? '保存中…' : '保存修改'}
        </button>
        <button type="button" onClick={onCancel} className="btn">
          取消
        </button>
      </div>
    </form>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '16px 18px', width: '100%', boxSizing: 'border-box', color: 'var(--text)' },
  filterRow: { display: 'flex', gap: 8, marginBottom: 12 },
  sourceTag: {
    flexShrink: 0,
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'var(--surface0)',
    color: 'var(--subtext0)',
  },
  loading: { padding: 60, textAlign: 'center', color: 'var(--overlay0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text)' },
  overview: {
    padding: 12,
    marginBottom: 16,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  },
  overviewTop: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
  overviewMain: { minWidth: 0 },
  overviewLabel: { fontSize: 11, color: 'var(--overlay0)', marginBottom: 2 },
  overviewValue: { fontSize: 20, fontWeight: 700, letterSpacing: 0.5 },
  overviewMetrics: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' },
  metric: { display: 'flex', gap: 6, fontSize: 11 },
  metricLabel: { color: 'var(--overlay0)' },
  metricValue: { color: 'var(--subtext0)' },
  holdings: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  holdingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  holdingNameArea: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  holdingName: {
    fontSize: 12.5,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  holdingSymbol: { fontSize: 10.5, color: 'var(--overlay0)' },
  holdingNums: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  holdingQty: { fontSize: 11.5, color: 'var(--subtext0)' },
  holdingPnl: { fontSize: 11.5, fontWeight: 600 },
  headerActions: { display: 'flex', gap: 8 },
  importBox: {
    padding: 12,
    marginBottom: 16,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  importHint: { fontSize: 11.5, color: 'var(--overlay0)', lineHeight: 1.6 },
  fileBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px 0',
    border: '1px dashed var(--border-strong)',
    borderRadius: 6,
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 12,
  },
  preview: { display: 'flex', flexDirection: 'column', gap: 6 },
  previewHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--subtext0)' },
  previewWarn: { fontSize: 11, color: 'var(--yellow)' },
  previewTable: { border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' },
  previewRowHead: {
    display: 'grid',
    gridTemplateColumns: '22px 1fr 1fr 40px 1fr 1fr 1fr 1.4fr',
    gap: 4,
    padding: '6px 8px',
    background: 'var(--bg-base)',
    fontSize: 10.5,
    color: 'var(--overlay0)',
  },
  previewRow: {
    display: 'grid',
    gridTemplateColumns: '22px 1fr 1fr 40px 1fr 1fr 1fr 1.4fr',
    gap: 4,
    padding: '6px 8px',
    fontSize: 11.5,
    color: 'var(--text)',
    cursor: 'pointer',
    borderTop: '1px solid var(--border)',
  },
  previewRowSel: { background: 'rgba(var(--blue-rgb), 0.12)' },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  formRow: { display: 'flex', gap: 8 },
  fieldGrow: { flex: 1, minWidth: 0 },
  blockField: { width: '100%' },
  datetimeField: { width: '100%', height: 30 },
  blockBtn: { width: '100%' },
  sideRow: { display: 'flex', gap: 8 },
  sideBtn: {
    flex: 1,
    padding: '6px 0',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 12,
  },
  sideBtnBuyActive: {
    borderColor: 'var(--up)',
    background: 'rgba(var(--up-rgb), 0.15)',
    color: 'var(--up)',
  },
  sideBtnSellActive: {
    borderColor: 'var(--down)',
    background: 'rgba(var(--down-rgb), 0.15)',
    color: 'var(--down)',
  },
  empty: { textAlign: 'center', color: 'var(--overlay0)', padding: '40px 10px', fontSize: 13 },
  emptyHint: { fontSize: 12, marginTop: 8, opacity: 0.8 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' },
  sideTag: {
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  sideTagBuy: { background: 'rgba(var(--up-rgb), 0.15)', color: 'var(--up)' },
  sideTagSell: { background: 'rgba(var(--down-rgb), 0.15)', color: 'var(--down)' },
  cardTitleArea: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  cardName: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardSymbol: { fontSize: 11, color: 'var(--overlay0)' },
  cardMetrics: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    fontSize: 12,
    color: 'var(--text)',
    flexShrink: 0,
  },
  cardQty: { fontSize: 11, color: 'var(--overlay0)' },
  cardTime: { fontSize: 11, color: 'var(--overlay0)', flexShrink: 0 },
  cardBtn: {
    width: 22,
    height: 22,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 10,
    padding: 0,
    flexShrink: 0,
  },
  reason: {
    padding: '0 12px 8px',
    fontSize: 11.5,
    color: 'var(--overlay0)',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  reviewBox: { padding: '0 12px 12px', borderTop: '1px solid var(--border)', paddingTop: 10 },
  reviewQ: { fontSize: 12, color: 'var(--subtext0)', marginBottom: 6 },
  reviewActions: { display: 'flex', gap: 8, marginTop: 10 },
  cardBtnActive: { color: 'var(--blue)' },
  growBtn: { flex: 1 },
}
