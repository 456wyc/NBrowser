/**
 * Copilot 模型路由：用轻量模型对「本轮用户消息」做意图分类，
 * 决定走轻量直答（chat）还是完整工具循环（tools）。
 *
 * 设计原则：
 * - 分类只输出一个词，max_tokens=10，成本近似为零；
 * - **解析失败或不确定一律按 tools**——走完整能力链路，绝不因为分类出错而降级丢能力；
 * - 分类本身失败（网络/限流）也按 tools，不影响主流程。
 */

export type RouteDecision = 'chat' | 'tools'

export const ROUTE_SYSTEM_PROMPT = `你是意图分类器。判断用户这轮消息该如何处理，只回复一个词：

- chat：可以直接回答的常识、概念解释、闲聊、对上一轮回答的追问（不依赖实时数据/用户数据/网页）
- tools：需要查行情、自选股、持仓、研究轨迹、笔记、报告、策略等用户数据，或需要联网检索，或要求执行写操作（加自选、建笔记）

规则：
- 拿不准、或依赖上文语境才能判断时，选 tools
- 只回复 chat 或 tools，不要任何其他内容`

/**
 * 解析分类结果：
 * - JSON 包裹（{"route":"chat"}）取字段值；
 * - 否则只认**开头**的完整英文单词，且必须精确等于 chat 才走轻量直答；
 * - 其余一切情况（空串、中文开头、带解释的长回复、乱码）一律按 tools——保守优先。
 */
export function parseRouteDecision(raw: string): RouteDecision {
  const text = (raw || '').trim().toLowerCase()
  if (!text) return 'tools'
  // 形如 {"route":"chat"} / {"decision": "tools"}
  const jsonMatch = text.match(/"(?:route|decision|intent)"\s*:\s*"([a-z]+)"/)
  if (jsonMatch) return jsonMatch[1] === 'chat' ? 'chat' : 'tools'
  // 开头必须是完整单词 chat（"chat." / "chat\n" 可以，"chatty" / "可能是chat吧" 不行）
  const head = text.match(/^[a-z]+/)
  return head && head[0] === 'chat' ? 'chat' : 'tools'
}

/** 组装分类输入：最新用户消息 + 最近一条助手回复（截断），给分类器一点上文语境 */
export function buildRouterInput(
  userMessage: string,
  lastAssistant?: string
): string {
  const parts = [`用户：${userMessage.trim()}`]
  if (lastAssistant && lastAssistant.trim()) {
    parts.push(`助手（上一轮，已截断）：${lastAssistant.trim().slice(0, 200)}`)
  }
  return parts.join('\n')
}
