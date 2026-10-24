import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { Database } from 'sql.js'
import type { Quote } from '../quote/provider'
import { computePortfolio, unrealizedPnl } from '@shared/pnl'
import { getAllWatchlist, getGroups } from '../db/watchlist'
import { getTrades } from '../db/trades'
import { getVisitsByDate } from '../db/page-visits'
import { searchNotes } from '../db/notes'
import { listReports } from '../db/research-reports'
import { listStrategies } from '../db/strategies'
import { getLatestQuoteHistory } from '../db/quote-history'
import { retrieveTopK } from '../ai/rag'

/**
 * Copilot 内部数据工具（只读）：
 * 让 AI 助手能查询「用户自己的数据」——自选股、持仓、研究轨迹、笔记、报告、行情历史、策略。
 * 这是本地助手相对通用云端 AI 的核心差异：它认识你。
 */

export interface DataToolDeps {
  getDb: () => Promise<Database>
  getLatestQuotes: () => { quotes: Quote[]; timestamp: number; error: string | null }
}

/** 自选股 + 实时行情 + 分组 */
async function readWatchlist(deps: DataToolDeps): Promise<unknown> {
  const db = await deps.getDb()
  const items = getAllWatchlist(db)
  const groups = getGroups(db).filter((g) => g.kind === 'custom')
  const { quotes } = deps.getLatestQuotes()
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))
  return {
    count: items.length,
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    items: items.map((it) => {
      const q = quoteMap.get(it.symbol)
      return {
        symbol: it.symbol,
        name: it.name,
        groupId: it.group_id ?? 0,
        price: q?.price ?? null,
        changePct: q?.changePercent ?? null,
      }
    }),
  }
}

/** 持仓与盈亏（复用 shared/pnl 的移动加权成本口径，与交易面板一致） */
async function readPositions(deps: DataToolDeps): Promise<unknown> {
  const db = await deps.getDb()
  const trades = getTrades(db, 500)
  if (trades.length === 0) return { message: '暂无交易记录' }
  const portfolio = computePortfolio(trades)
  const { quotes } = deps.getLatestQuotes()
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))
  const positions = portfolio.positions.map((p) => {
    const price = quoteMap.get(p.symbol)?.price ?? 0
    return {
      symbol: p.symbol,
      name: p.name,
      quantity: p.quantity,
      avgCost: round2(p.avgCost),
      currentPrice: price || null,
      unrealizedPnl: round2(unrealizedPnl(p, price)),
    }
  })
  return {
    positions,
    realizedPnl: round2(portfolio.totalRealizedPnl),
    sellCount: portfolio.sells.length,
  }
}

/** 最近 N 天的研究轨迹（按股票聚合停留时长，口径与「今日浏览」一致） */
async function readResearchTrail(deps: DataToolDeps, days: number): Promise<unknown> {
  const db = await deps.getDb()
  const bySymbol = new Map<string, { symbol: string; visits: number; durationMs: number; titles: string[] }>()
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    for (const v of getVisitsByDate(db, d)) {
      if (!v.symbol) continue
      const entry = bySymbol.get(v.symbol) ?? { symbol: v.symbol, visits: 0, durationMs: 0, titles: [] }
      entry.visits += 1
      entry.durationMs += v.duration_ms ?? 0
      if (v.title && entry.titles.length < 3 && !entry.titles.includes(v.title)) {
        entry.titles.push(v.title)
      }
      bySymbol.set(v.symbol, entry)
    }
  }
  const rows = [...bySymbol.values()]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20)
    .map((r) => ({ ...r, durationMin: Math.round(r.durationMs / 60000) }))
  return { days, stocks: rows }
}

/** 笔记检索：语义相似（本地向量）优先，关键字补充，去重合并 */
async function readNotes(deps: DataToolDeps, query: string): Promise<unknown> {
  const db = await deps.getDb()
  // 语义检索：本地 embedding 模型把 query 向量化后取 Top-K（不可用时静默退回纯关键字）
  let semantic: Array<{ id: number; title: string; content: string }> = []
  try {
    semantic = await retrieveTopK(db, query, 5)
  } catch {
    /* 本地向量模型未就绪，忽略 */
  }
  const keyword = searchNotes(db, query)
  // 合并去重：语义结果在前（按相关度），关键字结果补漏
  const byId = new Map<number, { id: number; title: string; updated_at: number; text: string }>()
  for (const n of semantic) {
    byId.set(n.id, { id: n.id, title: n.title, updated_at: 0, text: n.content })
  }
  for (const n of keyword) {
    if (!byId.has(n.id)) {
      byId.set(n.id, { id: n.id, title: n.title, updated_at: n.updated_at, text: n.preview })
    }
  }
  const notes = [...byId.values()].slice(0, 10).map((n) => ({
    id: n.id,
    title: n.title,
    updated_at: n.updated_at || null,
    preview: n.text.slice(0, 300),
  }))
  return {
    count: notes.length,
    match: semantic.length > 0 ? 'semantic+keyword' : 'keyword',
    notes,
  }
}

/** 历史研究报告 */
async function readReports(deps: DataToolDeps): Promise<unknown> {
  const db = await deps.getDb()
  const reports = listReports(db, 15)
  return {
    count: reports.length,
    reports: reports.map((r) => ({ id: r.id, query: r.query, mode: r.mode, created_at: r.created_at })),
  }
}

/** 行情历史（分时快照） */
async function readQuoteHistory(
  deps: DataToolDeps,
  symbol: string,
  limit: number
): Promise<unknown> {
  const db = await deps.getDb()
  const points = getLatestQuoteHistory(db, symbol, limit)
  if (points.length === 0) return { message: `没有 ${symbol} 的本地行情历史（仅在应用运行期间采集）` }
  return {
    symbol,
    samples: points.length,
    first: points[0],
    last: points[points.length - 1],
  }
}

/** 量化策略 */
async function readStrategies(deps: DataToolDeps): Promise<unknown> {
  const db = await deps.getDb()
  const strategies = listStrategies(db)
  return {
    count: strategies.length,
    strategies: strategies.map((s) => ({
      id: s.id,
      title: s.title,
      goal: s.goal,
      symbolCount: s.symbolCount ?? 0,
      conditionCount: s.conditionCount ?? 0,
      created_at: s.created_at,
    })),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 构建内部数据工具集（全部只读） */
export function buildDataTools(deps: DataToolDeps): DynamicStructuredTool[] {
  return [
    new DynamicStructuredTool({
      name: 'get_watchlist',
      description:
        '查询用户的自选股列表（含分组）与实时行情。当用户问「我的自选股」「自选里哪只跌得多」等涉及自己关注股票的问题时使用。',
      schema: z.object({}),
      func: async () => JSON.stringify(await readWatchlist(deps), null, 2),
    }),
    new DynamicStructuredTool({
      name: 'get_positions',
      description:
        '查询用户的持仓与盈亏（数量、成本、浮动盈亏、已实现盈亏），数据来自用户本地记录的交易。当用户问「我的持仓」「赚了还是亏了」时使用。',
      schema: z.object({}),
      func: async () => JSON.stringify(await readPositions(deps), null, 2),
    }),
    new DynamicStructuredTool({
      name: 'get_research_trail',
      description:
        '查询用户最近 N 天的研究轨迹：看过哪些股票、每只的访问次数与停留时长（按时长降序）。当用户问「我最近研究了什么」「我在某股票上花了多少时间」时使用。',
      schema: z.object({
        days: z.number().optional().describe('回溯天数，默认 7，最大 30'),
      }),
      func: async ({ days }) =>
        JSON.stringify(await readResearchTrail(deps, clampDays(days)), null, 2),
    }),
    new DynamicStructuredTool({
      name: 'search_notes',
      description:
        '检索用户的个人笔记（语义相似优先 + 关键字补充的混合检索，不受具体用词限制）。当用户问「我之前记过什么」「我的笔记里关于 XX」时使用。',
      schema: z.object({
        query: z.string().describe('检索关键字'),
      }),
      func: async ({ query }) => JSON.stringify(await readNotes(deps, query), null, 2),
    }),
    new DynamicStructuredTool({
      name: 'get_research_reports',
      description: '列出用户保存过的研究报告（主题、模式、时间）。当用户问「我之前写过什么报告」时使用。',
      schema: z.object({}),
      func: async () => JSON.stringify(await readReports(deps), null, 2),
    }),
    new DynamicStructuredTool({
      name: 'get_quote_history',
      description:
        '查询某只股票在本地采集的行情历史（现价走势，应用运行期间每数秒一条）。用于回答近期价格走势类问题。',
      schema: z.object({
        symbol: z.string().describe('股票代码，如 600519.SH'),
        limit: z.number().optional().describe('返回的采样点数，默认 60，最大 500'),
      }),
      func: async ({ symbol, limit }) =>
        JSON.stringify(
          await readQuoteHistory(deps, symbol, Math.min(Math.max(limit ?? 60, 10), 500)),
          null,
          2
        ),
    }),
    new DynamicStructuredTool({
      name: 'get_strategies',
      description:
        '列出用户的量化策略（标题、监控标的、条件数、是否运行中）。当用户问「我的策略」「策略触发情况」时使用。',
      schema: z.object({}),
      func: async () => JSON.stringify(await readStrategies(deps), null, 2),
    }),
  ]
}

function clampDays(days?: number): number {
  if (typeof days !== 'number' || !Number.isFinite(days)) return 7
  return Math.min(Math.max(Math.round(days), 1), 30)
}
