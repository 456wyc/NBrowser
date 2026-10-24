/**
 * 复盘闭环：交易 ↔ 当时的决策依据
 *
 * 产品的灵魂问题是「我当初为什么买」。浏览轨迹（page_visits）与 AI 分析
 * （ai_analyses）里已经沉淀了答案，但此前与交易记录完全割裂。
 * 本模块把「买入/卖出前 N 天、同一股票的研究记录」关联出来：
 *
 * - 窗口 = [tradedAt - hours, tradedAt]（决策形成于成交之前）；
 * - 按股票代码精确匹配（记录里 symbol 为空的一律不纳入，避免噪音）；
 * - 浏览按时间倒序（最近的在前）限 20 条，分析限 10 条；
 * - 汇总研究时长，让复盘第一眼看到「我在这只股票上花了多少功夫」。
 */

export interface ContextVisit {
  id: number
  url: string
  title: string | null
  symbol: string | null
  space: string
  started_at: number
  duration_ms: number
}

export interface ContextAnalysis {
  id: number
  url: string
  symbol: string | null
  page_type: string
  created_at: number
  summary: string
}

export const VISIT_LIMIT = 20
export const ANALYSIS_LIMIT = 10
/** 成交后仍纳入的小窗口（成交瞬间前后的补充记录，如确认下单前看的最后一眼） */
export const AFTER_WINDOW_MS = 2 * 3600 * 1000

export interface DecisionContextInput {
  visits: ContextVisit[]
  analyses: ContextAnalysis[]
  symbol: string
  tradedAt: number
  /** 回溯小时数（成交前） */
  hours: number
}

export interface DecisionContext {
  windowFrom: number
  windowTo: number
  visits: ContextVisit[]
  analyses: ContextAnalysis[]
  /** 窗口内总研究时长（毫秒） */
  totalResearchMs: number
}

export function selectDecisionContext(input: DecisionContextInput): DecisionContext {
  const hours = Math.min(Math.max(input.hours, 1), 24 * 30)
  const windowFrom = input.tradedAt - hours * 3600 * 1000
  const windowTo = input.tradedAt + AFTER_WINDOW_MS

  const visits = input.visits
    .filter(
      (v) =>
        v.symbol === input.symbol &&
        v.started_at >= windowFrom &&
        v.started_at <= windowTo
    )
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, VISIT_LIMIT)

  const analyses = input.analyses
    .filter(
      (a) =>
        a.symbol === input.symbol &&
        a.created_at >= windowFrom &&
        a.created_at <= windowTo
    )
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, ANALYSIS_LIMIT)

  const totalResearchMs = visits.reduce((sum, v) => sum + (v.duration_ms || 0), 0)

  return { windowFrom, windowTo, visits, analyses, totalResearchMs }
}

/** 时长的人读格式：90 分钟 / 47 分钟 / 40 秒 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  return `${h} 小时 ${min % 60} 分`
}

/** 时间的人读格式：MM-DD HH:mm */
export function formatContextTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 从 ai_analyses.result_json 中安全取出摘要（损坏 JSON 时返回空串） */
export function extractSummary(resultJson: string): string {
  try {
    const parsed = JSON.parse(resultJson || '{}')
    const s = parsed?.summary
    return typeof s === 'string' ? s : ''
  } catch {
    return ''
  }
}
