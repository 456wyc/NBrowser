import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { BrowserWindow, WebContents } from 'electron'
import { runInHeadlessPage } from '../browser/headless-page'
import { extractPageContent } from '../browser/content-extractor'
import { eastmoneyQuoteUrl, eastmoneyAnnouncementsUrl } from '@shared/stock-market'

/** 工具运行所需的依赖（与 deep-agent 共用，避免循环依赖） */
export interface ToolDeps {
  getWindow: () => BrowserWindow
  getActiveWebContents: () => WebContents | null
}

/** 内置工具名（与 AgentCapabilitiesConfig.builtinTools 的键对应） */
export const BUILTIN_TOOL_NAMES = [
  'web_search',
  'fetch_stock_quote',
  'fetch_stock_announcements',
  'open_and_read',
  'analyze_current_page',
] as const

/** 正文截断上限：单次工具返回给模型的文本长度 */
const MAIN_TEXT_LIMIT = 4000
const LINK_LIMIT = 15

function linksOf(c: { links?: { text: string; href: string }[] }): { text: string; href: string }[] {
  return (c.links || []).slice(0, LINK_LIMIT).map((l) => ({ text: l.text, href: l.href }))
}

/**
 * 构建联网/网页类工具（deep-agent 与 copilot 共用）：
 * - open_and_read：无头打开 URL 并抽取正文
 * - web_search：百度检索
 * - fetch_stock_quote / fetch_stock_announcements：东财定向抓取
 * - analyze_current_page：读取用户当前标签页内容
 */
export function buildWebTools(deps: ToolDeps): DynamicStructuredTool[] {
  const openAndRead = new DynamicStructuredTool({
    name: 'open_and_read',
    description:
      '打开一个网页 URL 并提取其主要正文、标题与关键链接，用于阅读具体页面内容（公告、新闻、研报、行情页等）。输入应为完整 http(s) 链接。',
    schema: z.object({ url: z.string().describe('要打开并阅读的完整 URL') }),
    func: async ({ url }) => {
      const win = deps.getWindow()
      return runInHeadlessPage(win, url, async (wc) => {
        const c = await extractPageContent(wc)
        return JSON.stringify(
          {
            url,
            title: c.title,
            mainText: (c.text || '').slice(0, MAIN_TEXT_LIMIT),
            links: linksOf(c),
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
      const win = deps.getWindow()
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
      '读取用户当前正在浏览的标签页内容（无需再传 URL），用于基于当前页面分析或深挖。',
    schema: z.object({}),
    func: async () => {
      const wc = deps.getActiveWebContents()
      if (!wc) return JSON.stringify({ error: '当前没有活动标签页' })
      const c = await extractPageContent(wc)
      return JSON.stringify(
        {
          url: wc.getURL(),
          title: c.title,
          mainText: (c.text || '').slice(0, MAIN_TEXT_LIMIT),
          links: linksOf(c),
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
      const win = deps.getWindow()
      const url = eastmoneyQuoteUrl(symbol)
      return runInHeadlessPage(win, url, async (wc) => {
        const c = await extractPageContent(wc)
        return JSON.stringify(
          { symbol, url, title: c.title, mainText: (c.text || '').slice(0, MAIN_TEXT_LIMIT) },
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
      symbol: z.string().describe('股票代码，如 600519.SH、000001'),
    }),
    func: async ({ symbol }) => {
      const win = deps.getWindow()
      const url = eastmoneyAnnouncementsUrl(symbol)
      return runInHeadlessPage(win, url, async (wc) => {
        const c = await extractPageContent(wc)
        const links = (c.links || [])
          .filter((l: any) => /notice|ann|\/detail/i.test(l.href || ''))
          .slice(0, LINK_LIMIT)
          .map((l: any) => ({ text: l.text, href: l.href }))
        return JSON.stringify(
          {
            symbol,
            url,
            title: c.title,
            mainText: (c.text || '').slice(0, MAIN_TEXT_LIMIT),
            links,
          },
          null,
          2
        )
      })
    },
  })

  return [webSearch, fetchQuote, fetchAnnouncements, openAndRead, analyzeCurrent]
}

/** 工具名 → 工具实例（供按名字查找执行） */
export function toolMapOf(tools: DynamicStructuredTool[]): Map<string, DynamicStructuredTool> {
  return new Map(tools.map((t) => [t.name, t]))
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
