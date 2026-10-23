import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IPC_CHANNELS,
  type StockSearchResult,
  type Strategy,
  type StrategyRuleConfig,
  type StrategyCondition,
  type StrategySummary,
  type StrategyGenerateResponse,
  type StrategySignal,
  type BacktestSymbolResult,
  type BacktestTrade,
} from '@shared/ipc'
import { useToast } from '../hooks/useToast'

/** 新手示例：一键填入，降低"不知道写什么"的门槛 */
const EXAMPLE_IDEAS = [
  '跌破60日线买入，站上20日线卖出',
  '突破20日新高追入，跌5%止损',
  'RSI低于30抄底，高于70离场',
]

/**
 * AI 量化策略：自然语言目标 → 大模型生成结构化规则 → 保存 / 回测。
 * 与研报页同构：列表 / 详情两态；另含「生成」浮层式卡片。
 */
export function StrategyPanel() {
  const [list, setList] = useState<StrategySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Strategy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  // 生成态
  const [generating, setGenerating] = useState(false)
  const [goal, setGoal] = useState('')
  const [symbols, setSymbols] = useState<string[]>([])
  const [preview, setPreview] = useState<StrategyGenerateResponse | null>(null)
  const [saveId, setSaveId] = useState<number | null>(null) // 重新生成时携带的原 id

  // 回测态
  const [backtest, setBacktest] = useState<BacktestSymbolResult[] | null>(null)
  const [backtesting, setBacktesting] = useState(false)
  const [btBars, setBtBars] = useState(250) // 回测区间（最近 N 根 K 线）

  // 运行态（实时买卖点）
  const [running, setRunning] = useState(false)
  const [signals, setSignals] = useState<StrategySignal[]>([])
  // 列表页展示的运行中策略 id 集合
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set())

  // 编辑态（手动微调规则参数，不必每次都问大模型）
  const [editing, setEditing] = useState(false)
  const [editConfig, setEditConfig] = useState<StrategyRuleConfig | null>(null)

  // 列表搜索（纯前端过滤标题/想法）
  const [keyword, setKeyword] = useState('')

  // 想法输入框随内容自动增高（策略想法往往是一段完整描述，不能只有一两行）
  const goalRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = goalRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 96), 260)}px`
  }, [goal])

  const load = async () => {
    setLoading(true)
    try {
      const [res, st] = await Promise.all([
        window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_LIST, {}),
        window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_STATUS, {}),
      ])
      setList(res.strategies)
      setRunningIds(new Set(st.running.map((r: { id: number }) => r.id)))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 订阅买卖点信号推送（全局，仅当属于当前打开的策略时入列 + 弹提示）
  useEffect(() => {
    const unsub = window.electronAPI.onStrategySignal((sig) => {
      if (!active || sig.strategyId !== active.id) return
      setSignals((prev) => [sig, ...prev])
      const tag = sig.action === 'buy' ? '🟢 买入' : '🔴 卖出'
      showToast(`${tag} ${sig.symbol} @ ${sig.price.toFixed(2)}（${sig.reason}）`)
    })
    return unsub
  }, [active?.id])

  const handleGenerate = async () => {
    if (!goal.trim()) {
      showToast('请先描述你的策略想法', false)
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_GENERATE, {
        goal: goal.trim(),
        symbols,
      })
      // 用户手动搜索选的标的优先覆盖模型推断的标的，保证预览与保存一致
      const merged = {
        ...res,
        config: {
          ...res.config,
          symbols: symbols.length > 0 ? symbols : res.config.symbols,
        },
      }
      setPreview(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!preview) return
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SAVE, {
        id: saveId ?? undefined,
        title: preview.title,
        goal: goal.trim(),
        config: preview.config,
      })
      showToast(saveId ? '已更新策略' : '已保存到策略库')
      setPreview(null)
      setSaveId(null)
      setGoal('')
      setSymbols([])
      setBacktest(null)
      await load()
    } catch (err) {
      showToast('保存失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const discardPreview = () => {
    setPreview(null)
    setSaveId(null)
  }

  const openStrategy = async (id: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_GET, { id })
      setActive(res.strategy)
      setBacktest(null)
      setSignals([])
      setRunning(false)
      setEditing(false)
      // 同步运行态与历史信号
      const [st, sg] = await Promise.all([
        window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_STATUS, {}),
        window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SIGNALS, { id }),
      ])
      setRunning(st.running.some((r: { id: number }) => r.id === id))
      setRunningIds(new Set(st.running.map((r: { id: number }) => r.id)))
      setSignals(sg.signals)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('删除该策略？删除后无法恢复。')) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_DELETE, { id })
      if (active?.id === id) setActive(null)
      showToast('已删除')
      await load()
    } catch (err) {
      showToast('删除失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const startEdit = (s: Strategy) => {
    setEditConfig(JSON.parse(JSON.stringify(s.config)) as StrategyRuleConfig)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!active || !editConfig) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SAVE, {
        id: active.id,
        title: active.title,
        goal: active.goal,
        config: editConfig,
      })
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_GET, { id: active.id })
      setActive(res.strategy)
      setEditing(false)
      setBacktest(null) // 规则变了，旧回测结果失效
      showToast('已保存修改')
    } catch (err) {
      showToast('保存失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const reGenerateFrom = (s: Strategy) => {
    setGoal(s.goal)
    setSymbols([...s.config.symbols])
    setPreview(null)
    setSaveId(s.id)
    setActive(null)
  }

  const runBacktest = async (id: number) => {
    setBacktesting(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_BACKTEST, {
        id,
        bars: btBars,
      })
      setBacktest(res.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBacktesting(false)
    }
  }

  const runStrategy = async (id: number) => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_RUN, { id })
      setRunning(true)
      setRunningIds((prev) => new Set(prev).add(id))
      const sg = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SIGNALS, { id })
      setSignals(sg.signals)
      showToast('策略已开始运行，买卖点将实时提示')
    } catch (err) {
      showToast('启动失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  // 列表按标题/想法过滤
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return list
    return list.filter(
      (s) => s.title.toLowerCase().includes(kw) || s.goal.toLowerCase().includes(kw)
    )
  }, [list, keyword])

  /** 立即检查一次：非交易时段也能验证规则配置是否写对 */
  const checkOnce = async (id: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_CHECK, { id })
      setRunning(true)
      setRunningIds((prev) => new Set(prev).add(id))
      const sg = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SIGNALS, { id })
      setSignals(sg.signals)
      if (res.signals.length === 0) {
        showToast('已按当前价检查一次：未触发买卖点（条件未满足）')
      } else {
        const s = res.signals[0]
        showToast(
          `触发 ${res.signals.length} 个信号：${s.action === 'buy' ? '买入' : '卖出'} ${s.symbol} @ ${s.price.toFixed(2)}`
        )
      }
    } catch (err) {
      showToast('检查失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  /** 复制策略：用当前规则创建一个新副本，便于在原策略上做 A/B 微调 */
  const duplicateStrategy = async (s: Strategy) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_SAVE, {
        title: `${s.title}（副本）`,
        goal: s.goal,
        config: s.config,
      })
      showToast('已复制为新策略')
      await load()
      if (res.strategy?.id) await openStrategy(res.strategy.id)
    } catch (err) {
      showToast('复制失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const stopAllStrategies = async () => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_STOP_ALL, {})
      setRunningIds(new Set())
      setRunning(false)
      showToast('已停止全部运行中的策略')
    } catch (err) {
      showToast('停止失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const stopStrategy = async (id: number) => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.STRATEGY_STOP, { id })
      setRunning(false)
      setRunningIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      showToast('策略已停止运行')
    } catch (err) {
      showToast('停止失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  // ---- 生成预览 / 编辑态 ----
  if (preview) {
    return (
      <div style={styles.container}>
        <div style={styles.detailHeader}>
          <button onClick={discardPreview} style={styles.backBtn}>
            ‹ 返回
          </button>
          <span style={styles.modeBadge}>{saveId ? '重新生成' : '生成预览'}</span>
          <button onClick={handleSave} className="btn-primary" style={{ marginLeft: 'auto' }}>
            {saveId ? '更新策略' : '保存到策略库'}
          </button>
        </div>
        <div style={styles.body}>
          <div style={styles.fieldBlock}>
            <div style={styles.label}>策略标题</div>
            <input
              className="field"
              value={preview.title}
              onChange={(e) => setPreview({ ...preview, title: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={styles.fieldBlock}>
            <div style={styles.label}>你的想法</div>
            <div style={styles.goalText}>{goal.trim()}</div>
          </div>
          <div style={styles.muted}>下面是不满意就改的规则，直接调参数/增删条件，再点右上角保存。</div>
          <ConfigEditor
            config={preview.config}
            onChange={(c) => setPreview({ ...preview, config: c })}
          />
        </div>
      </div>
    )
  }

  // ---- 详情态 ----
  if (active) {
    return (
      <div style={styles.container}>
        <div style={styles.detailHeader}>
          <button onClick={() => setActive(null)} style={styles.backBtn}>
            ‹ 返回
          </button>
          <span style={styles.modeBadge}>策略详情</span>
          {running ? (
            <button onClick={() => stopStrategy(active.id)} className="btn" style={{ marginLeft: 'auto' }}>
              ■ 停止运行
            </button>
          ) : (
            <button
              onClick={() => runStrategy(active.id)}
              className="btn-primary"
              style={{ marginLeft: 'auto' }}
              disabled={active.config.symbols.length === 0}
              title={active.config.symbols.length === 0 ? '请先在生成/编辑时补充标的' : undefined}
            >
              ▶ 运行
            </button>
          )}
          {editing ? (
            <>
              <button onClick={saveEdit} className="btn-primary" style={{ marginLeft: 'auto' }}>
                保存修改
              </button>
              <button onClick={() => setEditing(false)} className="btn">
                取消
              </button>
            </>
          ) : (
            <>
              <select
                className="field"
                style={styles.sel}
                value={btBars}
                onChange={(e) => setBtBars(Number(e.target.value))}
                title="回测区间"
              >
                <option value={250}>近 1 年</option>
                <option value={120}>近半年</option>
                <option value={60}>近 3 月</option>
              </select>
              <button onClick={() => runBacktest(active.id)} className="btn" disabled={backtesting}>
                {backtesting ? '回测中…' : '运行回测'}
              </button>
              <button
                onClick={() => checkOnce(active.id)}
                className="btn"
                disabled={active.config.symbols.length === 0}
                title="按当前价立即判定一次，非交易时段也能验证规则是否写对"
              >
                立即检查
              </button>
            </>
          )}
        </div>
        <div style={styles.body}>
          <div style={styles.fieldBlock}>
            <div style={styles.label}>策略标题</div>
            <div style={styles.goalText}>{active.title}</div>
          </div>
          <div style={styles.fieldBlock}>
            <div style={styles.label}>你的想法</div>
            <div style={styles.goalText}>{active.goal}</div>
          </div>
          {editing && editConfig ? (
            <ConfigEditor config={editConfig} onChange={setEditConfig} />
          ) : (
            <ConfigView config={active.config} />
          )}
          {!editing && <BacktestView results={backtest} />}
          <SignalView running={running} signals={signals} />
          {!editing && (
            <div style={styles.actionRow}>
              <button onClick={() => startEdit(active)} className="btn">
                编辑规则
              </button>
              <button onClick={() => duplicateStrategy(active)} className="btn">
                复制
              </button>
              <button onClick={() => reGenerateFrom(active)} className="btn">
                重新生成
              </button>
              <button
                onClick={() => handleDelete(active.id)}
                className="btn-danger"
                style={{ marginLeft: 'auto' }}
              >
                删除
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- 列表态 ----
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>AI 量化策略</span>
        <button onClick={load} className="icon-btn" title="刷新">
          ⟳
        </button>
      </div>

      <div style={styles.genBox}>
        <div style={styles.genTitle}>✨ 用大白话描述你的策略想法</div>
        <textarea
          ref={goalRef}
          className="field"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={'把你完整的交易想法写在这里，条件越多越好：\n例：茅台跌破 60 日线时买入，等它重新站上 20 日线就卖出；单笔亏超过 8% 无条件止损，赚到 20% 分批止盈'}
          style={{
            width: '100%',
            minHeight: 96,
            resize: 'none',
            fontSize: 12,
            lineHeight: 1.6,
            overflowY: 'auto',
          }}
        />
        {!goal && !generating && (
          <div style={styles.genExamples}>
            <span style={styles.genExamplesLabel}>试试：</span>
            {EXAMPLE_IDEAS.map((idea) => (
              <button
                key={idea}
                style={styles.exampleChip}
                onClick={() => setGoal(idea)}
                title="点击填入"
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        <div style={styles.genRow}>
          <SymbolPicker symbols={symbols} onChange={setSymbols} />
          <button onClick={handleGenerate} className="btn-primary" disabled={generating}>
            {generating ? '生成中…' : '✨ 生成'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ margin: '8px 16px' }}>
          {toast.text}
        </div>
      )}
      {error && <div style={styles.error}>{error}</div>}

      {loading && <div style={styles.empty}>加载中…</div>}
      {!loading && list.length === 0 && (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🤖</div>
          <p>还没有策略</p>
          <p style={styles.emptyHint}>在上方描述你的想法，点「生成」即可创建第一个策略</p>
        </div>
      )}

      {!loading && list.length > 0 && (
        <>
          {runningIds.size > 0 && (
            <div style={styles.runBar}>
              <span>● {runningIds.size} 个策略正在监控买卖点</span>
              <button onClick={stopAllStrategies} className="btn" style={styles.runBarBtn}>
                停止全部
              </button>
            </div>
          )}
          <input
            className="field"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索策略标题或想法…"
            style={styles.searchInput}
          />
        </>
      )}

      <div style={styles.list}>
        {filtered.map((s) => (
          <div key={s.id} style={styles.item}>
            <div style={styles.itemMain} onClick={() => openStrategy(s.id)}>
              <div style={styles.itemTop}>
                <span style={styles.modeBadge}>策略</span>
                {runningIds.has(s.id) && <span style={styles.runningBadge}>● 运行中</span>}
                <span style={styles.itemTime}>{formatTime(s.created_at)}</span>
              </div>
              <div style={styles.itemQuery}>{s.title}</div>
              <div style={styles.itemPreview}>{s.goal}</div>
              <div style={styles.itemMeta}>
                标的 {s.symbolCount ?? 0} · 条件 {s.conditionCount ?? 0} 条
              </div>
            </div>
            <button onClick={() => handleDelete(s.id)} style={styles.itemDelete} title="删除">
              ×
            </button>
          </div>
        ))}
        {!loading && list.length > 0 && filtered.length === 0 && (
          <div style={styles.muted}>没有匹配「{keyword}」的策略</div>
        )}
      </div>

      <div style={styles.footnote}>
        说明：本功能由大模型把你的想法转成可回测的规则参数，仅作策略思路验证，不构成任何投资建议。
      </div>
    </div>
  )
}

/** 标的选择器：与添加自选股同款搜索（代码或名称，300ms 防抖），点击下拉项添加为 chip */
function SymbolPicker({
  symbols,
  onChange,
}: {
  symbols: string[]
  onChange: (s: string[]) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setOpen(false)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SEARCH, {
          keyword: kw,
        })
        const filtered = (res.results as StockSearchResult[]).filter(
          (r) => !symbols.includes(r.symbol)
        )
        setResults(filtered)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [keyword, symbols])

  const add = (r: StockSearchResult) => {
    if (!symbols.includes(r.symbol)) onChange([...symbols, r.symbol])
    setKeyword('')
    setResults([])
    setOpen(false)
  }

  const remove = (s: string) => onChange(symbols.filter((x) => x !== s))

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      {symbols.length > 0 && (
        <div style={styles.pickChips}>
          {symbols.map((s) => (
            <span key={s} style={styles.pickChip}>
              {s}
              <button style={styles.chipX} onClick={() => remove(s)} title="移除">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="field"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onFocus={() => keyword.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={symbols.length > 0 ? '继续添加…' : '标的（可选）：输入代码或名称搜索，如 茅台 / 600519'}
        style={{ width: '100%', fontSize: 12 }}
      />
      {searching && <div style={styles.searching}>搜索中…</div>}
      {open && results.length > 0 && (
        <div style={styles.dropdown}>
          {results.slice(0, 8).map((r) => (
            <div
              key={r.symbol}
              style={styles.dropdownItem}
              onClick={() => add(r)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span style={styles.dName}>{r.name}</span>
              <span style={styles.dCode}>{r.symbol}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 规则配置可视化（解释引擎：把结构化配置转成可读清单） */
function ConfigView({ config }: { config: StrategyRuleConfig }) {
  const desc = describeConfig(config)
  return (
    <>
      <div style={styles.fieldBlock}>
        <div style={styles.label}>策略逻辑说明</div>
        <div style={styles.desc}>{config.description || '（模型未生成说明）'}</div>
      </div>

      <div style={styles.ruleGrid}>
        <RuleGroup title="入场条件" logic={config.entry.logic} items={desc.entry} />
        <RuleGroup title="出场条件" logic={config.exit.logic} items={desc.exit} />
        <div style={styles.ruleCol}>
          <div style={styles.ruleTitle}>风控</div>
          <ul style={styles.ruleList}>
            {desc.risk.length > 0 ? (
              desc.risk.map((r, i) => <li key={i}>{r}</li>)
            ) : (
              <li style={styles.muted}>（未设置）</li>
            )}
          </ul>
        </div>
      </div>

      <div style={styles.fieldBlock}>
        <div style={styles.label}>
          标的池 {config.symbols.length > 0 ? `（${config.symbols.length}）` : '（未指定）'}
        </div>
        <div style={styles.symbols}>
          {config.symbols.length > 0 ? (
            config.symbols.map((s) => (
              <span key={s} style={styles.chip}>
                {s}
              </span>
            ))
          ) : (
            <span style={styles.muted}>未指定，回测前请编辑补充或保留空（回测将跳过）</span>
          )}
        </div>
      </div>
    </>
  )
}

/** 条件类型的中文元信息（方向选项 + 可编辑参数） */
const COND_META: Record<
  StrategyCondition['type'],
  { name: string; dirs?: { value: string; label: string }[]; params: { key: keyof StrategyCondition; label: string }[] }
> = {
  ma_cross: {
    name: '均线交叉',
    dirs: [
      { value: 'golden', label: '金叉（快线上穿）' },
      { value: 'death', label: '死叉（快线下穿）' },
    ],
    params: [
      { key: 'fast', label: '快线' },
      { key: 'slow', label: '慢线' },
    ],
  },
  price_cross_ma: {
    name: '价格穿越均线',
    dirs: [
      { value: 'above', label: '站上均线' },
      { value: 'below', label: '跌破均线' },
    ],
    params: [{ key: 'maPeriod', label: '均线周期' }],
  },
  price_breakout: {
    name: '价格突破',
    dirs: [
      { value: 'break_high', label: '突破 N 日新高' },
      { value: 'break_low', label: '跌破 N 日新低' },
    ],
    params: [{ key: 'lookback', label: '回看天数' }],
  },
  rsi: {
    name: 'RSI 指标',
    dirs: [
      { value: 'overbought', label: '高于阈值' },
      { value: 'oversold', label: '低于阈值' },
    ],
    params: [{ key: 'threshold', label: '阈值' }],
  },
  volume_surge: {
    name: '成交量放大',
    params: [{ key: 'threshold', label: '倍数' }],
  },
  volume_shrink: {
    name: '成交量萎缩',
    params: [{ key: 'threshold', label: '倍数' }],
  },
  macd_cross: {
    name: 'MACD 交叉',
    dirs: [
      { value: 'golden', label: '金叉' },
      { value: 'death', label: '死叉' },
    ],
    params: [
      { key: 'fast', label: '快线' },
      { key: 'slow', label: '慢线' },
    ],
  },
  kdj_cross: {
    name: 'KDJ 交叉',
    dirs: [
      { value: 'golden', label: '金叉' },
      { value: 'death', label: '死叉' },
    ],
    params: [],
  },
  boll: {
    name: '布林带突破',
    dirs: [
      { value: 'break_upper', label: '突破上轨' },
      { value: 'break_lower', label: '跌破下轨' },
    ],
    params: [
      { key: 'bollPeriod', label: '周期' },
      { key: 'mult', label: '倍数' },
    ],
  },
  change_pct: {
    name: '当日涨跌幅',
    dirs: [
      { value: 'up', label: '涨幅 ≥' },
      { value: 'down', label: '跌幅 ≥' },
    ],
    params: [{ key: 'threshold', label: '%' }],
  },
  consecutive: {
    name: '连续涨跌',
    dirs: [
      { value: 'up', label: '连续上涨' },
      { value: 'down', label: '连续下跌' },
    ],
    params: [{ key: 'days', label: '天数' }],
  },
  ma_alignment: {
    name: '均线排列',
    dirs: [
      { value: 'bull', label: '多头排列' },
      { value: 'bear', label: '空头排列' },
    ],
    params: [
      { key: 'fast', label: '短均线' },
      { key: 'slow', label: '长均线' },
    ],
  },
}

/** 依据条件参数生成中文标签（回测与说明里展示） */
function makeLabel(c: StrategyCondition): string {
  const dir = c.direction ?? ''
  switch (c.type) {
    case 'ma_cross':
      return `${c.fast ?? 5}日${dir === 'golden' ? '上穿' : '下穿'}${c.slow ?? 20}日线`
    case 'price_cross_ma':
      return `${dir === 'above' ? '站上' : '跌破'}${c.maPeriod ?? 20}日线`
    case 'price_breakout':
      return `${dir === 'break_high' ? '突破' : '跌破'}${c.lookback ?? 20}日${dir === 'break_high' ? '新高' : '新低'}`
    case 'rsi':
      return `RSI${dir === 'overbought' ? '高于' : '低于'}${c.threshold ?? 30}`
    case 'volume_surge':
      return `成交量放大${c.threshold ?? 2}倍`
    case 'volume_shrink':
      return `成交量萎缩至${c.threshold ?? 0.5}倍`
    case 'macd_cross':
      return `MACD${dir === 'golden' ? '金叉' : '死叉'}`
    case 'kdj_cross':
      return `KDJ${dir === 'golden' ? '金叉' : '死叉'}`
    case 'boll':
      return `${dir === 'break_upper' ? '突破布林上轨' : '跌破布林下轨'}（${c.bollPeriod ?? 20}日 ${c.mult ?? 2}倍）`
    case 'change_pct':
      return `当日${dir === 'up' ? '涨幅' : '跌幅'}≥${c.threshold ?? 3}%`
    case 'consecutive':
      return `连续${c.days ?? 3}日${dir === 'up' ? '上涨' : '下跌'}`
    case 'ma_alignment':
      return `${dir === 'bull' ? '多头' : '空头'}排列（${c.fast ?? 5}/${c.slow ?? 20}）`
    default:
      return '条件'
  }
}

function defaultCondition(type: StrategyCondition['type']): StrategyCondition {
  const base: StrategyCondition = { type, label: '条件' } as StrategyCondition
  if (type === 'ma_cross') Object.assign(base, { direction: 'golden', fast: 5, slow: 20 })
  else if (type === 'price_cross_ma') Object.assign(base, { direction: 'above', maPeriod: 20 })
  else if (type === 'price_breakout') Object.assign(base, { direction: 'break_high', lookback: 20 })
  else if (type === 'rsi') Object.assign(base, { direction: 'oversold', threshold: 30 })
  else if (type === 'volume_surge') Object.assign(base, { threshold: 2 })
  else if (type === 'volume_shrink') Object.assign(base, { threshold: 0.5 })
  else if (type === 'macd_cross') Object.assign(base, { direction: 'golden', fast: 12, slow: 26, signalPeriod: 9 })
  else if (type === 'kdj_cross') Object.assign(base, { direction: 'golden' })
  else if (type === 'boll') Object.assign(base, { direction: 'break_upper', bollPeriod: 20, mult: 2 })
  else if (type === 'change_pct') Object.assign(base, { direction: 'down', threshold: 5 })
  else if (type === 'consecutive') Object.assign(base, { direction: 'down', days: 3 })
  else if (type === 'ma_alignment') Object.assign(base, { direction: 'bull', fast: 5, slow: 20 })
  return { ...base, label: makeLabel(base) }
}

/** 规则配置编辑器：手动微调入场/出场条件、风控与标的池 */
function ConfigEditor({
  config,
  onChange,
}: {
  config: StrategyRuleConfig
  onChange: (c: StrategyRuleConfig) => void
}) {
  return (
    <>
      <div style={styles.card}>
        <div style={styles.label}>标的池（留空则无法回测/运行）</div>
        <SymbolPicker symbols={config.symbols} onChange={(syms) => onChange({ ...config, symbols: syms })} />
      </div>
      <ConditionGroupEditor
        title="入场条件"
        group={config.entry}
        onChange={(g) => onChange({ ...config, entry: g })}
      />
      <ConditionGroupEditor
        title="出场条件"
        group={config.exit}
        onChange={(g) => onChange({ ...config, exit: g })}
      />
      <div style={styles.card}>
        <div style={styles.label}>风控</div>
        <div style={styles.riskRow}>
          {(
            [
              ['stopLossPct', '止损 %'],
              ['takeProfitPct', '止盈 %'],
              ['maxHoldDays', '最长持有(天)'],
              ['positionPct', '建议仓位 %'],
            ] as [keyof StrategyRuleConfig['risk'], string][]
          ).map(([key, label]) => (
            <label key={String(key)} style={styles.condParam}>
              {label}
              <input
                type="number"
                className="field"
                style={styles.numInput}
                value={config.risk[key] != null ? Number(config.risk[key]) : ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    risk: { ...config.risk, [key]: e.target.value === '' ? undefined : Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div style={styles.muted}>
          提示：止损/止盈填 0 表示不启用；改完点右上角「保存修改」，旧回测结果会失效需重跑。
        </div>
      </div>
    </>
  )
}

function ConditionGroupEditor({
  title,
  group,
  onChange,
}: {
  title: string
  group: { logic: 'and' | 'or'; conditions: StrategyCondition[] }
  onChange: (g: { logic: 'and' | 'or'; conditions: StrategyCondition[] }) => void
}) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>
        {title}
        <select
          className="field"
          style={styles.sel}
          value={group.logic}
          onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}
        >
          <option value="and">全部满足（且）</option>
          <option value="or">任一满足（或）</option>
        </select>
      </div>
      {group.conditions.length === 0 && <div style={styles.muted}>（无条件，永远不会触发）</div>}
      {group.conditions.map((c, i) => (
        <ConditionEditor
          key={i}
          cond={c}
          onChange={(nc) => {
            const next = [...group.conditions]
            next[i] = { ...nc, label: makeLabel(nc) }
            onChange({ ...group, conditions: next })
          }}
          onRemove={() => onChange({ ...group, conditions: group.conditions.filter((_, k) => k !== i) })}
        />
      ))}
      <select
        className="field"
        style={styles.sel}
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          onChange({
            ...group,
            conditions: [...group.conditions, defaultCondition(e.target.value as StrategyCondition['type'])],
          })
        }}
      >
        <option value="">＋ 添加条件…</option>
        {(Object.keys(COND_META) as StrategyCondition['type'][]).map((t) => (
          <option key={t} value={t}>
            {COND_META[t].name}
          </option>
        ))}
      </select>
    </div>
  )
}

function ConditionEditor({
  cond,
  onChange,
  onRemove,
}: {
  cond: StrategyCondition
  onChange: (c: StrategyCondition) => void
  onRemove: () => void
}) {
  const meta = COND_META[cond.type]
  return (
    <div style={styles.condRow}>
      <span style={styles.condName}>{meta?.name ?? cond.type}</span>
      {meta?.dirs && (
        <select
          className="field"
          style={styles.sel}
          value={String(cond.direction ?? meta.dirs[0].value)}
          onChange={(e) => onChange({ ...cond, direction: e.target.value } as StrategyCondition)}
        >
          {meta.dirs.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      )}
      {meta?.params.map((p) => (
        <label key={String(p.key)} style={styles.condParam}>
          {p.label}
          <input
            type="number"
            className="field"
            style={styles.numInput}
            value={Number((cond as any)[p.key] ?? 0)}
            onChange={(e) => onChange({ ...cond, [p.key]: Number(e.target.value) } as StrategyCondition)}
          />
        </label>
      ))}
      <button onClick={onRemove} style={styles.itemDelete} title="删除条件">
        ×
      </button>
    </div>
  )
}

function RuleGroup({ title, logic, items }: { title: string; logic: 'and' | 'or'; items: string[] }) {
  return (
    <div style={styles.ruleCol}>
      <div style={styles.ruleTitle}>
        {title} <span style={styles.logic}>{logic === 'and' ? '且' : '或'}</span>
      </div>
      <ul style={styles.ruleList}>
        {items.length > 0 ? (
          items.map((it, i) => <li key={i}>{it}</li>)
        ) : (
          <li style={styles.muted}>（无）</li>
        )}
      </ul>
    </div>
  )
}

/** 指标小卡：把关键数字从一长串文字里拎出来，扫一眼就懂 */
function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}

/** 累计收益曲线（按交易序列，SVG 折线，零轴虚线） */
function EquityCurve({ trades }: { trades: BacktestTrade[] }) {
  const pts: number[] = []
  let cum = 0
  for (const t of trades) {
    cum += t.pnlPct ?? 0
    pts.push(cum)
  }
  if (pts.length < 2) return null

  const w = 100
  const h = 30
  const min = Math.min(0, ...pts)
  const max = Math.max(0, ...pts)
  const span = max - min || 1
  const y = (v: number) => h - ((v - min) / span) * h
  const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${y(v)}`).join(' ')
  const last = pts[pts.length - 1]
  const color = last >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div style={styles.curveBox}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 36, display: 'block' }}
      >
        {min < 0 && max > 0 && (
          <line
            x1={0}
            x2={w}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--overlay0)"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={coords}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div style={styles.curveCaption}>累计收益走势（按成交顺序，共 {pts.length} 笔）</div>
    </div>
  )
}

function BacktestView({ results }: { results: BacktestSymbolResult[] | null }) {
  if (!results) return null
  if (results.length === 0) return <div style={styles.empty}>该策略没有指定标的，无法回测</div>
  return (
    <div style={styles.fieldBlock}>
      <div style={styles.label}>回测结果</div>
      {results.map((r) => (
        <div key={r.symbol} style={styles.btCard}>
          <div style={styles.btHeader}>
            <span style={styles.chip}>{r.symbol}</span>
            {r.hasData && (
              <span style={styles.srcTag}>
                数据源：{r.source === 'kline' ? '真实日线 K 线' : '本地轮询快照'}
              </span>
            )}
            {r.hasData ? (
              <>
                <div style={styles.metricRow}>
                  <Metric label="交易" value={`${r.summary.total} 笔`} />
                  <Metric label="胜率" value={`${(r.summary.winRate * 100).toFixed(0)}%`} />
                  <Metric
                    label="累计收益"
                    value={`${r.summary.totalReturnPct > 0 ? '+' : ''}${r.summary.totalReturnPct}%`}
                    color={r.summary.totalReturnPct >= 0 ? 'var(--green)' : 'var(--red)'}
                  />
                  <Metric label="最大回撤" value={`${r.summary.maxDrawdownPct}%`} color="var(--red)" />
                  <Metric label="平均持有" value={`${r.summary.avgHoldDays} 天`} />
                </div>
                <EquityCurve trades={r.trades} />
                {r.benchmarkPct != null && (
                  <div style={styles.benchRow}>
                    同期「买入并持有」{r.benchmarkPct >= 0 ? '+' : ''}
                    {r.benchmarkPct}% ·{' '}
                    {(() => {
                      const diff = Number(
                        (r.summary.totalReturnPct - r.benchmarkPct).toFixed(2)
                      )
                      return (
                        <b style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          策略{diff >= 0 ? '跑赢' : '跑输'} {Math.abs(diff)}%
                        </b>
                      )
                    })()}
                    {r.barCount ? ` （${r.barCount} 根 K 线）` : ''}
                  </div>
                )}
              </>
            ) : (
              <span style={styles.muted}>
                行情数据不足（真实 K 线拉取失败且本地快照少于 30 条），把该标的加入自选可自动积累
              </span>
            )}
          </div>
          {r.hasData && r.trades.length > 0 && (
            <table style={styles.tradeTable}>
              <thead>
                <tr>
                  <th style={styles.th}>入场时间</th>
                  <th style={styles.th}>入场价</th>
                  <th style={styles.th}>出场时间</th>
                  <th style={styles.th}>出场价</th>
                  <th style={styles.th}>盈亏</th>
                  <th style={styles.th}>原因</th>
                </tr>
              </thead>
              <tbody>
                {r.trades.slice(0, 15).map((t, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{formatTime(t.entryTs)}</td>
                    <td style={styles.td}>{t.entryPrice.toFixed(2)}</td>
                    <td style={styles.td}>{t.exitTs ? formatTime(t.exitTs) : '-'}</td>
                    <td style={styles.td}>{t.exitPrice != null ? t.exitPrice.toFixed(2) : '-'}</td>
                    <td style={{ ...styles.td, color: (t.pnlPct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {t.pnlPct != null ? `${t.pnlPct.toFixed(2)}%` : '-'}
                    </td>
                    <td style={styles.td}>{t.exitReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <div style={styles.muted}>
        仅基于本地已采集的行情快照回放，非严格交易日回测，结果仅供参考。
      </div>
    </div>
  )
}

/** 买卖点信号流：展示运行期间触发的买入/卖出提示 */
function SignalView({ running, signals }: { running: boolean; signals: StrategySignal[] }) {
  return (
    <div style={styles.fieldBlock}>
      <div style={styles.label}>
        买卖点信号 {signals.length > 0 && `（${signals.length} 条）`}
        {running && <span style={styles.liveDot}>● 监控中</span>}
      </div>
      {signals.length === 0 ? (
        <div style={styles.muted}>
          {running
            ? '监控中（仅交易时段判定），触发买卖点会在此实时显示并弹窗提示'
            : '点「运行」开始监控，触发买卖点将实时弹窗提示'}
        </div>
      ) : (
        <div style={styles.signalList}>
          {signals.slice(0, 50).map((s) => (
            <div key={s.id || `${s.strategyId}-${s.ts}`} style={styles.signalRow}>
              <span
                style={{
                  ...styles.signalAction,
                  color: s.action === 'buy' ? 'var(--green)' : 'var(--red)',
                }}
              >
                {s.action === 'buy' ? '▲ 买入' : '▼ 卖出'}
              </span>
              <span style={styles.signalSym}>{s.symbol}</span>
              <span style={styles.signalPrice}>@ {s.price.toFixed(2)}</span>
              <span style={styles.signalReason}>{s.reason}</span>
              <span style={styles.signalTime}>{formatTime(s.ts)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={styles.muted}>信号仅由规则触发提示，不构成投资建议。</div>
    </div>
  )
}

/** 解释引擎：结构化配置 → 中文清单（label 已含描述，risk 转中文） */
function describeConfig(config: StrategyRuleConfig) {
  return {
    entry: config.entry.conditions.map((c) => c.label),
    exit: config.exit.conditions.map((c) => c.label),
    risk: [
      config.risk.stopLossPct != null ? `止损 ${config.risk.stopLossPct}%` : null,
      config.risk.takeProfitPct != null ? `止盈 ${config.risk.takeProfitPct}%` : null,
      config.risk.maxHoldDays != null ? `最大持有 ${config.risk.maxHoldDays} 天` : null,
      config.risk.positionPct != null ? `单笔仓位 ${config.risk.positionPct}%` : null,
    ].filter((x): x is string => Boolean(x)),
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '12px 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px 8px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  genBox: {
    margin: '0 16px 10px',
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-crust)',
    display: 'flex',
    flexDirection: 'column',
  },
  genTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 },
  genExamples: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  genExamplesLabel: { fontSize: 11, color: 'var(--overlay0)', flexShrink: 0 },
  exampleChip: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 12,
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  genRow: { display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-start' },
  pickChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  pickChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    padding: '2px 4px 2px 8px',
    borderRadius: 10,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
  },
  chipX: {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    padding: '0 3px',
    opacity: 0.7,
  },
  searching: { fontSize: 11, color: 'var(--overlay0)', padding: '2px 4px' },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    marginTop: 2,
    background: 'var(--bg-base, var(--bg-crust))',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    maxHeight: 200,
    overflowY: 'auto',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
  dName: { color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dCode: { color: 'var(--overlay0)', fontSize: 11 },
  list: { flex: 1, overflowY: 'auto' },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
  },
  itemMain: { flex: 1, minWidth: 0, cursor: 'pointer' },
  itemTop: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  modeBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
    flexShrink: 0,
  },
  itemTime: { fontSize: 11, color: 'var(--overlay0)' },
  itemQuery: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemPreview: {
    fontSize: 11,
    color: 'var(--overlay0)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemDelete: {
    border: 'none',
    background: 'transparent',
    color: 'var(--overlay0)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '0 16px 10px',
    borderBottom: '1px solid var(--border)',
  },
  backBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--blue)',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, color: 'var(--overlay0)' },
  goalText: {
    fontSize: 13,
    color: 'var(--text)',
    background: 'var(--bg-crust)',
    borderRadius: 6,
    padding: '8px 10px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  desc: {
    fontSize: 12,
    color: 'var(--text)',
    lineHeight: 1.7,
    background: 'var(--bg-crust)',
    borderRadius: 6,
    padding: '8px 10px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  ruleGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
  ruleCol: {
    background: 'var(--bg-crust)',
    borderRadius: 6,
    padding: '8px 10px',
  },
  ruleTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 },
  logic: { fontSize: 11, color: 'var(--blue)', fontWeight: 400 },
  ruleList: { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--subtext0)', lineHeight: 1.7 },
  symbols: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
  },
  muted: { color: 'var(--overlay0)', fontSize: 12 },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '36px 20px',
    fontSize: 13,
  },
  emptyIcon: { fontSize: 34, marginBottom: 8, opacity: 0.6 },
  emptyHint: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  error: {
    margin: '0 12px 8px',
    padding: '6px 10px',
    borderRadius: 4,
    background: 'rgba(var(--red-rgb), 0.12)',
    color: 'var(--red)',
    fontSize: 11,
  },
  footnote: {
    padding: '10px 16px',
    fontSize: 10,
    color: 'var(--overlay0)',
    borderTop: '1px solid var(--border)',
    lineHeight: 1.6,
  },
  btCard: {
    marginTop: 8,
    background: 'var(--bg-crust)',
    borderRadius: 6,
    padding: '8px 10px',
  },
  btHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  btSummary: { fontSize: 11, color: 'var(--subtext0)' },
  tradeTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    textAlign: 'left',
    padding: '4px 8px',
    color: 'var(--overlay0)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '4px 8px',
    color: 'var(--subtext0)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  liveDot: {
    marginLeft: 6,
    fontSize: 11,
    color: 'var(--green)',
  },
  runningBadge: {
    fontSize: 10,
    color: 'var(--green)',
    marginLeft: 6,
    flexShrink: 0,
  },
  condRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    padding: '4px 0',
  },
  condName: { fontSize: 11, color: 'var(--text)', minWidth: 84 },
  condParam: { fontSize: 11, color: 'var(--subtext0)', display: 'flex', alignItems: 'center', gap: 4 },
  numInput: { width: 62, padding: '2px 4px', fontSize: 11 },
  sel: { fontSize: 11, padding: '2px 4px', maxWidth: 150 },
  riskRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  srcTag: { fontSize: 10, color: 'var(--overlay0)', flexShrink: 0 },
  runBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '0 16px 8px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'var(--bg-crust)',
    border: '1px solid var(--border)',
    fontSize: 11,
    color: 'var(--green)',
  },
  runBarBtn: { marginLeft: 'auto', padding: '2px 8px', fontSize: 11 },
  searchInput: { margin: '0 16px 8px', width: 'calc(100% - 32px)', fontSize: 11, padding: '4px 8px' },
  itemMeta: { fontSize: 10, color: 'var(--overlay0)', marginTop: 2 },
  metricRow: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 2px' },
  metric: {
    flex: '1 1 62px',
    minWidth: 62,
    padding: '4px 6px',
    borderRadius: 5,
    background: 'var(--bg-crust)',
    border: '1px solid var(--border)',
  },
  metricLabel: { fontSize: 9, color: 'var(--overlay0)' },
  metricValue: { fontSize: 12, fontWeight: 600, marginTop: 1 },
  benchRow: { fontSize: 10, color: 'var(--subtext0)', margin: '2px 0 4px' },
  curveBox: { margin: '2px 0 4px' },
  curveCaption: { fontSize: 9, color: 'var(--overlay0)', marginTop: 2 },
  card: {
    padding: '8px 10px',
    marginBottom: 8,
    borderRadius: 6,
    background: 'var(--bg-crust)',
    border: '1px solid var(--border)',
  },
  actionRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 4,
    borderTop: '1px solid var(--border)',
  },
  signalList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight: 220,
    overflowY: 'auto',
    borderRadius: 6,
    border: '1px solid var(--border)',
    padding: 4,
  },
  signalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    padding: '3px 4px',
  },
  signalAction: { fontWeight: 600, flexShrink: 0, minWidth: 52 },
  signalSym: { color: 'var(--text)', flexShrink: 0 },
  signalPrice: { color: 'var(--subtext0)', flexShrink: 0 },
  signalReason: { color: 'var(--overlay0)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  signalTime: { color: 'var(--overlay0)', flexShrink: 0 },
}
