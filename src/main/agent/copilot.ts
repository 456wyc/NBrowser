import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages'
import type { AgentEvent } from '@shared/ipc'
import { appendDisclaimerIfNeeded } from '@shared/agent-compliance'
import { buildUserProfileText, type UserProfileInput } from '@shared/agent-profile'
import type { AgentCapabilitiesConfig } from '@shared/agent-capabilities'
import { getDb } from '../db'
import { getAllWatchlist } from '../db/watchlist'
import { getTrades } from '../db/trades'
import { getVisitsByDate } from '../db/page-visits'
import { computePortfolio, unrealizedPnl } from '@shared/pnl'
import {
  createSession,
  getSession,
  parseSessionMessages,
  updateSession,
  type AgentMessage,
} from '../db/agent-sessions'
import { buildWebTools, toolMapOf, type ToolDeps } from './tools'
import { buildDataTools, type DataToolDeps } from './data-tools'
import { buildActionTools, type ActionToolDeps } from './action-tools'
import {
  ROUTE_SYSTEM_PROMPT,
  buildRouterInput,
  parseRouteDecision,
  type RouteDecision,
} from './route'

/**
 * AI 助手 Copilot：
 * - 多轮会话（持久化到 agent_sessions 表，跨重启恢复）；
 * - 三类工具：联网（web_search/open_and_read/…）、内部数据（只读：自选/持仓/轨迹/笔记/报告/行情/策略）、
 *   行动（写：加自选/建笔记，执行前必须经用户确认）；
 * - token 级流式输出（delta 事件）；
 * - 系统提示注入用户画像 + 合规红线，输出层再做一次建议模式检测并附免责声明。
 */

export interface CopilotDeps extends ToolDeps, DataToolDeps, ActionToolDeps {}

export interface CopilotConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 轻量模型（模型路由用）；留空 = 不启用路由，全部走主模型 */
  fastModel?: string
  capabilities: AgentCapabilitiesConfig
}

const MAX_STEPS = 6
/** 载入的历史消息条数上限（控制 token 成本） */
const HISTORY_LIMIT = 20

/** 从 LangChain 消息内容里抽取纯文本 */
function msgText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : (c as any)?.type === 'text' ? (c as any).text : ''))
      .join('')
  }
  return ''
}

export class CopilotAgent {
  constructor(
    private deps: CopilotDeps,
    private config: CopilotConfig
  ) {}

  /**
   * 处理一轮用户消息。
   * 返回会话 ID（新建或既有）。
   */
  async chat(
    opts: { sessionId?: number; message: string; currentUrl?: string; persona?: string },
    onEvent: (e: AgentEvent) => void,
    signal?: AbortSignal
  ): Promise<{ sessionId: number }> {
    if (!this.config.apiKey) {
      onEvent({ type: 'error', message: 'API Key 未配置，请在设置中填写' })
      return { sessionId: opts.sessionId ?? 0 }
    }

    const db = await getDb()
    let sessionId = opts.sessionId
    if (typeof sessionId !== 'number' || !getSession(db, sessionId)) {
      sessionId = createSession(db)
    }

    const history = parseSessionMessages(getSession(db, sessionId)?.messages_json ?? '[]').slice(
      -HISTORY_LIMIT
    )
    const userMessage: AgentMessage = { role: 'user', content: opts.message }
    const transcript: AgentMessage[] = [...history, userMessage]

    // 模型路由：配了轻量模型时，先用它判意图——简单问答走轻量直答（省钱），
    // 需要数据/工具/写操作走完整链路（保能力）。分类失败一律按 tools。
    const route = await this.classifyRoute(opts.message, history)

    const base =
      route === 'chat' ? buildChatSystemPrompt() : await this.buildSystemPrompt(opts.currentUrl)
    // 身份提示词（桌宠「牛来」用）：拼在最前面，优先于通用人设生效
    const persona = opts.persona?.trim()
    const systemPrompt = persona ? `${persona}\n\n${base}` : base
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...toLangChainMessages(transcript),
    ]

    const tools = [...buildWebTools(this.deps), ...buildDataTools(this.deps), ...buildActionTools(this.deps)]
    const model = new ChatOpenAI({
      model: this.config.model,
      apiKey: this.config.apiKey,
      configuration: { baseURL: this.config.baseUrl.replace(/\/$/, '') },
      temperature: 0.3,
    })
    // chat 路由：轻量模型直接答（不绑定工具，省去工具定义的输入 token）；
    // tools 路由：主模型 + 全工具。能走到 chat 说明 classifyRoute 已确认 fastModel 非空。
    const llmWithTools =
      route === 'chat'
        ? new ChatOpenAI({
            model: this.config.fastModel!.trim(),
            apiKey: this.config.apiKey,
            configuration: { baseURL: this.config.baseUrl.replace(/\/$/, '') },
            temperature: 0.3,
          })
        : model.bindTools(tools)
    const toolMap = toolMapOf(tools)

    let finalText = ''
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (signal?.aborted) {
          onEvent({ type: 'error', message: '已停止' })
          return { sessionId }
        }

        const acc = await streamOnce(llmWithTools, messages, onEvent, signal)
        if (signal?.aborted) {
          onEvent({ type: 'error', message: '已停止' })
          return { sessionId }
        }

        if (acc.toolCalls.length === 0) {
          finalText = acc.text
          break
        }

        messages.push(
          new AIMessage({
            content: acc.text,
            tool_calls: acc.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: safeParseArgs(tc.arguments),
              type: 'tool_call' as const,
            })),
          })
        )
        transcript.push({
          role: 'assistant',
          content: acc.text,
          tool_calls: acc.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
        })

        for (const tc of acc.toolCalls) {
          if (signal?.aborted) {
            onEvent({ type: 'error', message: '已停止' })
            return { sessionId }
          }
          onEvent({ type: 'tool_call', name: tc.name, args: safeParseArgs(tc.arguments) })
          const tool = toolMap.get(tc.name)
          let result = ''
          try {
            result = tool ? await tool.func(safeParseArgs(tc.arguments)) : `未知工具: ${tc.name}`
          } catch (err: any) {
            result = `工具执行失败: ${err?.message || String(err)}`
          }
          const clipped = result.slice(0, 6000)
          onEvent({ type: 'tool_result', name: tc.name, result: clipped })
          messages.push(new ToolMessage({ content: clipped, tool_call_id: tc.id, name: tc.name }))
          transcript.push({
            role: 'tool',
            content: clipped,
            tool_call_id: tc.id,
            name: tc.name,
          })
        }
      }

      if (!finalText) finalText = '(本轮到步数上限，以上为阶段性回答。)'
      const withDisclaimer = appendDisclaimerIfNeeded(finalText)

      transcript.push({ role: 'assistant', content: withDisclaimer })
      updateSession(db, sessionId, {
        title: deriveTitle(transcript),
        messages_json: JSON.stringify(transcript),
      })

      onEvent({ type: 'done', report: withDisclaimer })
      return { sessionId }
    } catch (err: any) {
      onEvent({ type: 'error', message: err?.message || String(err) })
      return { sessionId }
    }
  }

  /**
   * 模型路由：用轻量模型对本轮消息做意图分类。
   * 未配置轻量模型、或分类失败时一律返回 'tools'（完整能力链路）。
   */
  private async classifyRoute(message: string, history: AgentMessage[]): Promise<RouteDecision> {
    const fastModel = this.config.fastModel?.trim()
    if (!fastModel) return 'tools'
    try {
      const lastAssistant = [...history]
        .reverse()
        .find((m) => m.role === 'assistant' && m.content.trim())
      const router = new ChatOpenAI({
        model: fastModel,
        apiKey: this.config.apiKey,
        configuration: { baseURL: this.config.baseUrl.replace(/\/$/, '') },
        temperature: 0,
        maxTokens: 10,
      })
      const res = await router.invoke([
        new SystemMessage(ROUTE_SYSTEM_PROMPT),
        new HumanMessage(buildRouterInput(message, lastAssistant?.content)),
      ])
      return parseRouteDecision(msgText(res.content))
    } catch (err) {
      // 分类失败不影响主流程：按完整链路处理（能力优先于省钱）
      console.error('[copilot] 路由分类失败，按完整链路处理：', err)
      return 'tools'
    }
  }

  /** 组装系统提示：基础人设 + 用户画像 + 当前页提示 + 合规红线 */
  private async buildSystemPrompt(currentUrl?: string): Promise<string> {
    const parts: string[] = [
      `你是牛Browser 内置的 AI 助手，服务对象是个人投资者。你可以：
1. 回答与 A 股、基金、宏观相关的查询，可联网检索（web_search / open_and_read / fetch_stock_quote / fetch_stock_announcements）；
2. 查询用户自己的数据：自选股（get_watchlist）、持仓盈亏（get_positions）、研究轨迹（get_research_trail）、笔记（search_notes）、历史报告（get_research_reports）、本地行情历史（get_quote_history）、量化策略（get_strategies）；
3. 读取用户当前浏览的页面（analyze_current_page）辅助分析；
4. 操作用户的数据：把股票加入自选股（add_to_watchlist）、创建笔记（create_note）。
   这两个是写操作，调用后系统会请用户确认，用户取消则不要反复重试，直接告知结果。

回答要求：
- 用中文，简洁直接，先给结论再给依据；
- 只陈述有依据的事实，无法确认的明确说「不确定」；
- 涉及用户持仓/自选股的问题，优先调用对应工具拿实时数据，不要凭印象回答；
- 用户问「我」相关的问题（我的持仓、我的自选、我研究过什么）时，必须调用数据工具查询后再回答。`,
    ]

    const profile = await this.buildProfileText()
    if (profile) parts.push(profile)

    if (currentUrl) {
      parts.push(`用户当前正在浏览：${currentUrl}（如问题与页面相关，可用 analyze_current_page 读取内容）`)
    }

    parts.push(
      `【合规红线（必须遵守）】
- 你不提供投资建议：不预测股价、不给目标价、不建议买入/卖出/持有任何证券；
- 可以陈述事实、罗列利好与利空信息、解释概念与数据，但结论必须留给用户自己判断；
- 涉及社区讨论、个人观点类内容时，注明这是观点而非事实。`
    )

    return parts.join('\n\n')
  }

  /** 读取用户画像数据并压缩为一段文本（失败时静默跳过，不阻断对话） */
  private async buildProfileText(): Promise<string> {
    try {
      const db = await getDb()

      const items = getAllWatchlist(db)
      const { quotes } = this.deps.getLatestQuotes()
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))
      const watchlist = items.map((it) => ({
        symbol: it.symbol,
        name: it.name,
        changePct: quoteMap.get(it.symbol)?.changePercent ?? null,
      }))

      const trades = getTrades(db, 500)
      const portfolio = computePortfolio(trades)
      const positions = portfolio.positions.map((p) => ({
        symbol: p.symbol,
        name: p.name,
        quantity: p.quantity,
        unrealizedPnl: unrealizedPnl(p, quoteMap.get(p.symbol)?.price ?? 0),
      }))

      const trailBySymbol = new Map<string, number>()
      const today = new Date()
      for (let i = 0; i < 7; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        for (const v of getVisitsByDate(db, d)) {
          if (!v.symbol) continue
          trailBySymbol.set(v.symbol, (trailBySymbol.get(v.symbol) ?? 0) + (v.duration_ms ?? 0))
        }
      }
      const trail = [...trailBySymbol.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([symbol, ms]) => ({ symbol, durationMin: Math.round(ms / 60000) }))

      const input: UserProfileInput = { watchlist, positions, trail }
      return buildUserProfileText(input)
    } catch (err) {
      console.error('[copilot] 画像构建失败（已跳过）:', err)
      return ''
    }
  }
}

/** 流式调用一轮，累积文本与工具调用 */
async function streamOnce(
  llm: ReturnType<ChatOpenAI['bindTools']>,
  messages: BaseMessage[],
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: { id: string; name: string; arguments: string }[] }> {
  let text = ''
  const toolAcc = new Map<number, { id: string; name: string; args: string }>()

  for await (const chunk of await llm.stream(messages, { signal })) {
    if (typeof chunk.content === 'string' && chunk.content) {
      text += chunk.content
      onEvent({ type: 'delta', text: chunk.content })
    } else if (Array.isArray(chunk.content)) {
      for (const c of chunk.content) {
        if (c && typeof c === 'object' && (c as any).type === 'text' && (c as any).text) {
          text += (c as any).text
          onEvent({ type: 'delta', text: (c as any).text })
        }
      }
    }
    const tcs = (chunk as any).tool_call_chunks as
      | { name?: string; args?: string; id?: string; index?: number }[]
      | undefined
    if (Array.isArray(tcs)) {
      for (const tc of tcs) {
        const idx = tc.index ?? 0
        const entry = toolAcc.get(idx) ?? { id: '', name: '', args: '' }
        if (tc.id) entry.id = tc.id
        if (tc.name) entry.name = tc.name
        if (tc.args) entry.args += tc.args
        toolAcc.set(idx, entry)
      }
    }
  }

  const toolCalls = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      id: v.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: v.name,
      arguments: v.args,
    }))
    .filter((tc) => tc.name)

  return { text, toolCalls }
}

/** AgentMessage → LangChain 消息 */
function toLangChainMessages(msgs: AgentMessage[]): BaseMessage[] {
  const out: BaseMessage[] = []
  for (const m of msgs) {
    if (m.role === 'user') out.push(new HumanMessage(m.content))
    else if (m.role === 'assistant') {
      out.push(
        new AIMessage({
          content: m.content,
          tool_calls: (m.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.name,
            args: safeParseArgs(tc.arguments),
            type: 'tool_call' as const,
          })),
        })
      )
    } else if (m.role === 'tool') {
      out.push(new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id ?? '', name: m.name }))
    }
  }
  return out
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 会话标题：取首条用户消息前 20 字 */
function deriveTitle(msgs: AgentMessage[]): string {
  const first = msgs.find((m) => m.role === 'user')
  const text = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 20) : '新会话'
}

/**
 * 轻量直答（chat 路由）的系统提示：不含工具清单与画像——不查数据就不该带这些上下文，
 * 输入 token 更小、响应更快；合规红线必须保留。
 */
function buildChatSystemPrompt(): string {
  return `你是牛Browser 内置的 AI 助手，服务对象是个人投资者。当前是轻量问答：不查数据、不联网，基于通识直接回答。

回答要求：
- 用中文，简洁直接，先给结论再给依据；
- 只陈述有依据的事实，无法确认的明确说「不确定」。

【合规红线（必须遵守）】
- 你不提供投资建议：不预测股价、不给目标价、不建议买入/卖出/持有任何证券；
- 可以陈述事实、罗列利好与利空信息、解释概念与数据，但结论必须留给用户自己判断。`
}
