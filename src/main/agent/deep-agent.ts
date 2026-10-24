import { ChatOpenAI } from '@langchain/openai'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { BrowserWindow, WebContents } from 'electron'
import type { AgentEvent, AgentMode } from '@shared/ipc'
import type { AgentCapabilitiesConfig } from '@shared/agent-capabilities'
import { McpClient } from './mcp-client'
import { buildCustomTool } from './custom-tool'
import { buildWebTools, toolMapOf } from './tools'

export { filterSearchLinks } from './tools'

export interface AgentDeps {
  getWindow: () => BrowserWindow
  getActiveWebContents: () => WebContents | null
}

export interface AgentConfig {
  baseUrl: string
  apiKey: string
  model: string
  capabilities: AgentCapabilitiesConfig
}

const MAX_STEPS = 12

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

/**
 * LangChain 深度研究代理：
 * - 给定目标（股票/问题）自主多步联网浏览、阅读、综合，产出结构化研究报告；
 * - 或基于「当前页面」深挖（analyze_current_page + 联网补充）。
 * 通过 onEvent 把思考、工具调用、结果、最终报告流式回传。
 * 浏览使用无头 WebContentsView，与用户手动浏览的标签页相互隔离。
 */
export class DeepResearchAgent {
  constructor(
    private deps: AgentDeps,
    private config: AgentConfig
  ) {}

  async run(
    query: string,
    opts: { mode: AgentMode; currentUrl?: string },
    onEvent: (e: AgentEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.config.apiKey) {
      onEvent({ type: 'error', message: 'API Key 未配置，请在设置中填写' })
      return
    }

    const mcpClients: McpClient[] = []
    let mcpTools: DynamicStructuredTool[] = []
    try {
      for (const srv of this.config.capabilities.mcpServers || []) {
        if (!srv.enabled) continue
        try {
          const client = new McpClient(srv)
          await client.connect()
          mcpTools = mcpTools.concat(await client.listTools())
          mcpClients.push(client)
        } catch (err: any) {
          onEvent({
            type: 'thought',
            text: `⚠️ MCP「${srv.name || srv.id}」连接失败，已跳过：${err?.message || err}`,
          })
        }
      }
    } catch {
      /* ignore */
    }

    const model = new ChatOpenAI({
      model: this.config.model,
      apiKey: this.config.apiKey,
      configuration: { baseURL: this.config.baseUrl.replace(/\/$/, '') },
      temperature: 0,
    })

    const baseTools = this.buildTools()
    const tools = [...baseTools, ...mcpTools]
    const llmWithTools = model.bindTools(tools)
    const toolMap = toolMapOf(tools)

    const messages = [new SystemMessage(this.systemPrompt(opts)), new HumanMessage(query)]

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
      if (signal?.aborted) {
        onEvent({ type: 'error', message: '已停止' })
        return
      }

      const ai = await llmWithTools.invoke(messages)
      messages.push(ai)

      const text = msgText(ai.content)

      const calls = (ai as any).tool_calls as
        | { name: string; args: any; id?: string }[]
        | undefined

      // 最终回答（无工具调用）只通过 done 事件下发，避免同一段文本
      // 先以原始 thought 出现一遍、再以渲染后的报告重复一遍
      if (!calls || calls.length === 0) {
        onEvent({ type: 'done', report: text.trim() || '(未生成报告)' })
        return
      }

      if (text.trim()) onEvent({ type: 'thought', text: text.trim() })

      for (const tc of calls) {
        if (signal?.aborted) {
          onEvent({ type: 'error', message: '已停止' })
          return
        }
        onEvent({ type: 'tool_call', name: tc.name, args: tc.args })
        const tool = toolMap.get(tc.name)
        let result = ''
        try {
          result = tool ? await tool.func(tc.args) : `未知工具: ${tc.name}`
        } catch (err: any) {
          result = `工具执行失败: ${err?.message || String(err)}`
        }
        onEvent({ type: 'tool_result', name: tc.name, result: result.slice(0, 6000) })
        messages.push(new ToolMessage({ content: result, tool_call_id: tc.id ?? tc.name }))
      }
    }

    onEvent({ type: 'done', report: '(已达到最大研究步数，以上为阶段性结论。)' })
    } finally {
      for (const c of mcpClients) {
        try {
          await c.disconnect()
        } catch {
          /* noop */
        }
      }
    }
  }

  private buildTools(): DynamicStructuredTool[] {
    const cap = this.config.capabilities
    const tools: DynamicStructuredTool[] = []
    // 联网/网页工具：与 Copilot 共用同一实现（tools.ts）
    for (const tool of buildWebTools(this.deps)) {
      const ov = cap.builtinTools?.[tool.name]
      if (ov && ov.enabled === false) continue
      if (ov && ov.description) tool.description = ov.description
      tools.push(tool)
    }
    for (const ct of cap.customTools || []) {
      try {
        tools.push(buildCustomTool(ct, this.deps))
      } catch (err) {
        console.error('[agent] 自定义工具构建失败:', ct.name, err)
      }
    }
    return tools
  }

  private systemPrompt(opts: { mode: AgentMode }): string {
    const base = `你是一名专业的股票研究员助手，帮助用户对指定股票或投资问题进行深度网络调研。

工作流：
1. 先判断能否确定股票代码。
   - 能确定：优先用 fetch_stock_quote 拿行情数据、fetch_stock_announcements 拿最新公告，
     这两步是定向抓取，比搜索引擎准确得多，应优先于 web_search。
   - 不能确定（只有公司名/主题）：先用 web_search 检索，确定代码后再走上面的定向抓取。
2. 需要更深入的信息（新闻、研报、具体公告正文）时，用 web_search 检索，
   再从结果中挑最相关的链接用 open_and_read 逐一阅读，抽取关键事实与数据。
3. 必要时再次搜索补充。
4. 综合后，用中文输出一份结构化研究报告（Markdown）：

# 概览
（一句话结论）
## 核心数据
（关键数字、估值、业绩）
## 利好因素
## 利空 / 风险
## 信息来源
（列出引用过的页面标题与 URL）

要求：
- 只陈述能从页面取证的事实；无法确认的信息标注「待核实」。
- 最多进行 10 次工具调用。
- 最终回复即为报告全文，不要只说「已生成报告」之类的话。`

    if (opts.mode === 'deepen') {
      return (
        base +
        '\n\n当前模式：用户正在浏览某个网页。请先调用 analyze_current_page 获取当前页面内容，再据此联网补充、交叉验证，输出对当前主题的深化分析（沿用上述报告结构）。'
      )
    }
    return base
  }
}
