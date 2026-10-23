import { useEffect, useMemo, useState } from 'react'
import type { AiAnalysisView, PageType } from '@shared/ipc'

export interface AiPanelProps {
  result: AiAnalysisView | null
  history: AiAnalysisView[]
  loading: boolean
  loadingHistory: boolean
  error: string | null
  onAnalyze: () => void
  onLoadHistory: () => void
  onDeleteRecord: (id: number) => void
  onClose: () => void
  onOpenSettings: () => void
}

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  announcement: '公告',
  news: '新闻',
  financial_report: '财报',
  community: '社区讨论',
  general: '通用',
}

export function AiPanel({
  result,
  history,
  loading,
  loadingHistory,
  error,
  onAnalyze,
  onLoadHistory,
  onDeleteRecord,
  onClose,
  onOpenSettings,
}: AiPanelProps) {
  const [tab, setTab] = useState<'current' | 'history'>('current')
  const [keyword, setKeyword] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  // 历史按关键字过滤（代码 / 网址 / 摘要）
  const visibleHistory = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return history
    return history.filter((item) =>
      [item.symbol || '', item.url || '', item.result?.summary || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [history, keyword])

  // 出结果后自动切回「本次分析」页
  useEffect(() => {
    if (result) setTab('current')
  }, [result])

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>✨</span>
          <span style={styles.headerTitle}>AI 整理</span>
        </div>
        <div style={styles.headerActions}>
          <button onClick={onAnalyze} disabled={loading} className="icon-btn" title="重新分析当前页">
            {loading ? '…' : '↻'}
          </button>
          <button onClick={onOpenSettings} className="icon-btn" title="LLM 设置">
            ⚙
          </button>
          <button onClick={onClose} className="icon-btn" title="关闭面板">
            ×
          </button>
        </div>
      </div>

      {/* Tab */}
      <div style={styles.tabs}>
        <button
          onClick={() => setTab('current')}
          style={{ ...styles.tab, ...(tab === 'current' ? styles.tabActive : {}) }}
        >
          本次分析
        </button>
        <button
          onClick={() => {
            setTab('history')
            onLoadHistory()
          }}
          style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }}
        >
          历史记录
        </button>
      </div>

      <div style={styles.body}>
        {tab === 'current' ? (
          <>
            {loading && (
              <div style={styles.state}>
                <div style={styles.spinnerText}>正在读取页面并整理…</div>
                <div style={styles.stateHint}>首次分析需要等待模型返回，通常几秒到十几秒</div>
              </div>
            )}

            {!loading && error && (
              <div style={styles.errorBox}>
                <div style={styles.errorTitle}>分析失败</div>
                <div style={styles.errorMsg}>{error}</div>
                <div style={styles.errorActions}>
                  <button onClick={onAnalyze} className="btn-primary">
                    重试
                  </button>
                  {/API Key/.test(error) && (
                    <button onClick={onOpenSettings} style={styles.inlineBtn}>
                      去配置 API Key
                    </button>
                  )}
                </div>
              </div>
            )}

            {!loading && !error && !result && (
              <div style={styles.state}>
                <div style={styles.stateHint}>点击顶部 ↻ 或地址栏 ✨ 分析当前页面</div>
                <div style={styles.stateHint}>只做信息整理，不预测价格、不给买卖建议</div>
              </div>
            )}

            {!loading && !error && result && <AnalysisResultView view={result} />}
          </>
        ) : (
          <>
            <div style={styles.historyBar}>
              <input
                className="field"
                style={{ flex: 1, minWidth: 0 }}
                placeholder="搜索代码 / 网址 / 摘要"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <button
                onClick={onLoadHistory}
                className="icon-btn"
                disabled={loadingHistory}
                title="刷新历史"
              >
                ⟳
              </button>
            </div>
            {loadingHistory && <div style={styles.state}>加载中…</div>}
            {!loadingHistory && history.length === 0 && (
              <div style={styles.state}>暂无历史分析记录</div>
            )}
            {!loadingHistory && history.length > 0 && visibleHistory.length === 0 && (
              <div style={styles.state}>没有匹配的历史记录</div>
            )}
            {!loadingHistory &&
              visibleHistory.map((item) => (
                <div key={item.id} style={styles.historyItem}>
                  <div
                    style={styles.historyHead}
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    title="点击展开完整分析"
                  >
                    <span style={styles.historySymbol}>{item.symbol || '未识别'}</span>
                    <span style={styles.historyPageType}>
                      {PAGE_TYPE_LABEL[item.pageType] || '通用'}
                    </span>
                    <span style={styles.historyTime}>{formatTime(item.created_at)}</span>
                    <span style={styles.historyToggle}>{openId === item.id ? '▲' : '▼'}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteRecord(item.id)
                      }}
                      className="icon-btn danger"
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                  {openId === item.id ? (
                    <AnalysisResultView view={item} />
                  ) : (
                    <>
                      <div style={styles.historySummary}>{item.result.summary}</div>
                      <div style={styles.historyUrl} title={item.url}>
                        {item.url || '—'}
                      </div>
                    </>
                  )}
                </div>
              ))}
          </>
        )}
      </div>

      <div style={styles.footer}>本功能仅整理原文信息，不构成任何投资建议</div>
    </div>
  )
}

function AnalysisResultView({ view }: { view: AiAnalysisView }) {
  const isOpinion = view.result.source_type === 'opinion'

  return (
    <div style={styles.result}>
      {/* 元信息 */}
      <div style={styles.metaRow}>
        {view.symbol && <span style={styles.badgeSymbol}>{view.symbol}</span>}
        <span style={styles.badge}>{PAGE_TYPE_LABEL[view.pageType] || '通用'}</span>
        <span
          style={{
            ...styles.badge,
            ...(isOpinion ? styles.badgeOpinion : styles.badgeFact),
          }}
        >
          {isOpinion ? '观点' : '事实'}
        </span>
        {view.result.truncated && <span style={styles.badge}>内容已截断</span>}
        <span style={styles.metaTime}>{formatTime(view.created_at)}</span>
      </div>

      <div style={styles.pageTitle} title={view.url}>
        {view.title}
      </div>

      {isOpinion && (
        <div style={styles.opinionWarn}>
          该页面为社区讨论内容，以下属于他人观点，不代表事实
        </div>
      )}

      {/* 摘要 */}
      <Section title="核心摘要">
        <div style={styles.summary}>{view.result.summary}</div>
      </Section>

      {/* 利好 / 利空 */}
      <div style={styles.twoCol}>
        <Section title="利好">
          <PointList
            items={view.result.bullish}
            color="var(--up)"
            empty="未提取到明确的利好因素"
          />
        </Section>
        <Section title="利空">
          <PointList
            items={view.result.bearish}
            color="var(--down)"
            empty="未提取到明确的利空因素"
          />
        </Section>
      </div>

      {/* 关键数据 */}
      {view.result.key_data.length > 0 && (
        <Section title="关键数据">
          <div style={styles.kvList}>
            {view.result.key_data.map((kv, i) => (
              <div key={i} style={styles.kvItem}>
                <span style={styles.kvName}>{kv.name}</span>
                <span style={styles.kvValue}>{kv.value}</span>
                {kv.period && <span style={styles.kvPeriod}>{kv.period}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 存疑点 */}
      {view.result.uncertainties.length > 0 && (
        <Section title="存疑 / 需核实">
          <ul style={styles.ul}>
            {view.result.uncertainties.map((u, i) => (
              <li key={i} style={styles.li}>
                {u}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function PointList({
  items,
  color,
  empty,
}: {
  items: { point: string; evidence: string }[]
  color: string
  empty: string
}) {
  if (items.length === 0) return <div style={styles.empty}>{empty}</div>
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={styles.pointItem}>
          <div style={{ ...styles.pointText, color }}>· {it.point}</div>
          {it.evidence && <div style={styles.pointEvidence}>依据：{it.evidence}</div>}
        </div>
      ))}
    </div>
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
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-mantle)',
    borderLeft: '1px solid var(--border)',
    color: 'var(--text)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 16 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  headerActions: { display: 'flex', gap: 2 },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: '8px 12px 0',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  tab: {
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    color: 'var(--overlay0)',
    cursor: 'pointer',
    fontSize: 13,
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  tabActive: { color: 'var(--text)', borderBottomColor: 'var(--blue)', fontWeight: 500 },
  body: { flex: 1, overflowY: 'auto', padding: 14 },
  footer: {
    padding: '8px 14px',
    fontSize: 11,
    color: 'var(--overlay0)',
    borderTop: '1px solid var(--border)',
    textAlign: 'center',
    flexShrink: 0,
  },
  state: {
    padding: '40px 10px',
    textAlign: 'center',
    color: 'var(--overlay0)',
    fontSize: 13,
  },
  spinnerText: { fontSize: 13, color: 'var(--blue)', marginBottom: 8 },
  stateHint: { fontSize: 12, marginTop: 6, opacity: 0.8 },
  errorBox: {
    padding: 14,
    borderRadius: 8,
    background: 'rgba(var(--red-rgb), 0.1)',
    border: '1px solid rgba(var(--red-rgb), 0.3)',
  },
  errorTitle: { fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 6 },
  errorMsg: { fontSize: 12, color: 'var(--text)', lineHeight: 1.6, wordBreak: 'break-word' },
  errorActions: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  inlineBtn: {
    marginTop: 10,
    padding: '6px 14px',
    border: '1px solid var(--blue)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--blue)',
    cursor: 'pointer',
    fontSize: 12,
  },
  result: { display: 'flex', flexDirection: 'column', gap: 4 },
  metaRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    padding: '2px 8px',
    borderRadius: 10,
    background: 'var(--surface0)',
    color: 'var(--subtext0)',
    fontSize: 11,
  },
  badgeSymbol: {
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
    fontSize: 11,
    fontWeight: 600,
  },
  badgeFact: { background: 'rgba(var(--blue-rgb), 0.15)', color: 'var(--blue)' },
  badgeOpinion: { background: 'rgba(var(--yellow-rgb), 0.15)', color: 'var(--yellow)' },
  metaTime: { marginLeft: 'auto', fontSize: 11, color: 'var(--overlay0)' },
  pageTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    marginTop: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  opinionWarn: {
    marginTop: 8,
    padding: '8px 10px',
    borderRadius: 6,
    background: 'rgba(var(--yellow-rgb), 0.1)',
    color: 'var(--yellow)',
    fontSize: 12,
    lineHeight: 1.5,
  },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    color: 'var(--overlay0)',
    marginBottom: 6,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: 13,
    lineHeight: 1.7,
    color: 'var(--text)',
    background: 'var(--surface0)',
    padding: '10px 12px',
    borderRadius: 8,
  },
  twoCol: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  pointItem: { marginBottom: 8 },
  pointText: { fontSize: 12.5, lineHeight: 1.5, fontWeight: 500 },
  pointEvidence: { fontSize: 11.5, color: 'var(--overlay0)', lineHeight: 1.5, marginTop: 2 },
  empty: { fontSize: 12, color: 'var(--overlay0)', fontStyle: 'italic' },
  kvList: { display: 'flex', flexDirection: 'column', gap: 4 },
  kvItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '6px 10px',
    background: 'var(--surface0)',
    borderRadius: 6,
    fontSize: 12.5,
  },
  kvName: { color: 'var(--subtext0)', flexShrink: 0 },
  kvValue: { color: 'var(--text)', fontWeight: 600 },
  kvPeriod: { marginLeft: 'auto', fontSize: 11, color: 'var(--overlay0)' },
  ul: { margin: 0, paddingLeft: 18 },
  li: { fontSize: 12.5, lineHeight: 1.6, color: 'var(--subtext0)', marginBottom: 4 },
  historyItem: {
    padding: '10px 12px',
    background: 'var(--surface0)',
    borderRadius: 8,
    marginBottom: 8,
  },
  historyHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    cursor: 'pointer',
  },
  historyBar: { display: 'flex', gap: 6, marginBottom: 8 },
  historyToggle: { fontSize: 10, color: 'var(--overlay0)' },
  historySymbol: { fontSize: 12, fontWeight: 600, color: 'var(--blue)' },
  historyPageType: { fontSize: 11, color: 'var(--overlay0)' },
  historyTime: { marginLeft: 'auto', fontSize: 11, color: 'var(--overlay0)' },
  historySummary: { fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' },
  historyUrl: {
    fontSize: 11,
    color: 'var(--overlay0)',
    marginTop: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
