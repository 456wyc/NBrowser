import { ChatOpenAI } from '@langchain/openai'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { BrowserWindow, WebContents } from 'electron'
import { runInHeadlessPage } from '../browser/headless-page'
import { extractPageContent } from '../browser/content-extractor'
import { eastmoneyQuoteUrl, eastmoneyAnnouncementsUrl } from '@shared/stock-market'
import type { AgentEvent, AgentMode } from '@shared/ipc'
import type { AgentCapabilitiesConfig } from '@shared/agent-capabilities'
import { McpClient } from './mcp-client'
import { buildCustomTool } from './custom-tool'

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
    const toolMap = new Map(tools.map((t) => [t.name, t]))

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
    const openAndRead = new DynamicStructuredTool({
      name: 'open_and_read',
      description:
        '打开一个网页 URL 并提取其主要正文、标题与关键链接，用于阅读具体页面内容（公告、新闻、研报、行情页等）。输入应为完整 http(s) 链接。',
      schema: z.object({ url: z.string().describe('要打开并阅读的完整 URL') }),
      func: async ({ url }) => {
        const win = this.deps.getWindow()
        return runInHeadlessPage(win, url, async (wc) => {
          const c = await extractPageContent(wc)
          const links = (c.links || [])
            .slice(0, 15)
            .map((l: any) => ({ text: l.text, href: l.href }))
          return JSON.stringify(
            {
              url,
              title: c.title,
              mainText: (c.text || '').slice(0, 4000),
              links,
            },
            null,
            2
          )
        })
      },
    })

    const webSearch = new DynamicStructuredTool({
      name: 'web_search',
      description:
        '用搜索引擎（百度）检索关键词，返回最相关的结果链接列表（标题 + URL），用于发现需要深入阅读的页面。',
      schema: z.object({ query: z.string().describe('搜索关键词，如「贵州茅台 2024 年报 净利润」') }),
      func: async ({ query }) => {
        const win = this.deps.getWindow()
        const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
        return runInHeadlessPage(win, searchUrl, async (wc) => {
          const c = await extractPageContent(wc)
          const results = filterSearchLinks(c.links || [])
          return JSON.stringify({ query, results: results.slice(0, 12) }, null, 2)
        })
      },
    })

    const analyzeCurrent = new DynamicStructuredTool({
      name: 'analyze_current_page',
      description:
        '读取用户当前正在浏览的标签页内容（无需再传 URL），用于基于当前页面深挖。仅在「深挖当前页」模式下使用。',
      schema: z.object({}),
      func: async () => {
        const wc = this.deps.getActiveWebContents()
        if (!wc) return JSON.stringify({ error: '当前没有活动标签页' })
        const c = await extractPageContent(wc)
        const links = (c.links || [])
          .slice(0, 15)
          .map((l: any) => ({ text: l.text, href: l.href }))
        return JSON.stringify(
          {
            url: wc.getURL(),
            title: c.title,
            mainText: (c.text || '').slice(0, 4000),
            links,
          },
          null,
          2
        )
      },
    })

    const fetchQuote = new DynamicStructuredTool({
      name: 'fetch_stock_quote',
      description:
        '抓取指定股票的东方财富行情页：现价、涨跌幅、成交量、市值、估值等关键数据。已知股票代码时优先用它，比搜索引擎更准确、更省步骤。',
      schema: z.object({
        symbol: z.string().describe('股票代码，如 600519、600519.SH、000001'),
      }),
      func: async ({ symbol }) => {
        const win = this.deps.getWindow()
        const url = eastmoneyQuoteUrl(symbol)
        return runInHeadlessPage(win, url, async (wc) => {
          const c = await extractPageContent(wc)
          return JSON.stringify(
            { symbol, url, title: c.title, mainText: (c.text || '').slice(0, 4000) },
            null,
            2
          )
        })
      },
    })

    const fetchAnnouncements = new DynamicStructuredTool({
      name: 'fetch_stock_announcements',
      description:
        '抓取指定股票的东方财富「个股公告」页：最新公告标题与日期，用于了解近期公告、财报披露、重大事项。已知股票代码时优先使用。',
      schema: z.object({
        symbol: z.string().describe('股票代码，如 600519、600519.SH'),
      }),
      func: async ({ symbol }) => {
        const win = this.deps.getWindow()
        const url = eastmoneyAnnouncementsUrl(symbol)
        return runInHeadlessPage(win, url, async (wc) => {
          const c = await extractPageContent(wc)
          const links = (c.links || [])
            .filter((l: any) => /notice|ann|\/detail/i.test(l.href || ''))
            .slice(0, 15)
            .map((l: any) => ({ text: l.text, href: l.href }))
          return JSON.stringify(
            {
              symbol,
              url,
              title: c.title,
              mainText: (c.text || '').slice(0, 4000),
              links,
            },
            null,
            2
          )
        })
      },
    })

    const cap = this.config.capabilities
    const named: Array<[string, DynamicStructuredTool]> = [
      ['web_search', webSearch],
      ['fetch_stock_quote', fetchQuote],
      ['fetch_stock_announcements', fetchAnnouncements],
      ['open_and_read', openAndRead],
      ['analyze_current_page', analyzeCurrent],
    ]
    const tools: DynamicStructuredTool[] = []
    for (const [name, tool] of named) {
      const ov = cap.builtinTools?.[name]
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

/**
 * 从搜索引擎结果页抽取真实结果链接，过滤掉站内 UI / 无关链接。
 */
export function filterSearchLinks(
  links: { text: string; href: string }[]
): { title: string; url: string }[] {
  const seen = new Set<string>()
  const out: { title: string; url: string }[] = []
  for (const l of links) {
    const h = l.href || ''
    if (!/^https?:\/\//i.test(h)) continue
    if (/^https?:\/\/www\.baidu\.com\/(s|home|index|login|register)?([/?]|$)/i.test(h)) continue
    if (seen.has(h)) continue
    seen.add(h)
    out.push({ title: l.text || h, url: h })
  }
  return out
}
