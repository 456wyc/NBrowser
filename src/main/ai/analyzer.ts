import { LLMClient } from './llm-client'
import { getSystemPrompt, buildUserPrompt } from './prompts'
import type { AiAnalysisResult, PageType, AnalysisMode } from './types'
import { extractStockFromUrl } from '../stock-extractor'

// 正文长度上限（字符），超过则截断
const MAX_CONTENT_LENGTH = 8000

/**
 * 分析结果（包含原始文本和元信息）
 */
export interface AnalysisResult {
  result: AiAnalysisResult
  url: string
  title: string
  symbol: string | null
  pageType: PageType
  inputExcerpt: string // 实际用于分析的文本（不超过 2000 字）
  truncated: boolean
}

/**
 * AI 分析器
 * 负责：页面类型判断、内容截断、调用 LLM、解析结果、关联股票
 */
export class AiAnalyzer {
  private llmClient: LLMClient

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient
  }

  /**
   * 分析页面内容
   */
  async analyze(params: {
    url: string
    title: string
    content: string
    mode: AnalysisMode
  }): Promise<AnalysisResult> {
    const { url, title, content, mode } = params

    // 1. 判断页面类型
    const pageType = detectPageType(url, title, content)

    // 2. 截断内容
    const { text: processedText, truncated } = truncateContent(content, MAX_CONTENT_LENGTH)

    // 3. 构建 Prompt
    const systemPrompt = getSystemPrompt(pageType, truncated)
    const userPrompt = buildUserPrompt(title, processedText, mode)

    // 4. 提取输入摘要（用于存储，不超过 2000 字）
    const inputExcerpt = processedText.slice(0, 2000)

    // 5. 调用 LLM
    let result: AiAnalysisResult
    try {
      result = await this.llmClient.analyze(systemPrompt, userPrompt)
    } catch (err: any) {
      // 调用失败，抛出让上层处理
      throw new Error(`分析失败：${err.message}`)
    }

    // 6. 标记截断状态
    if (truncated) {
      result.truncated = true
    }

    // 7. 识别关联股票
    const symbol = extractStockFromUrl(url)

    return {
      result,
      url,
      title,
      symbol,
      pageType,
      inputExcerpt,
      truncated,
    }
  }
}

/**
 * 判断页面类型
 * 基于 URL、标题和内容特征
 */
function detectPageType(url: string, title: string, content: string): PageType {
  const urlLower = url.toLowerCase()
  const titleLower = title.toLowerCase()
  const contentSample = content.slice(0, 500).toLowerCase()

  // 公告
  if (
    /announcement|notice|gonggao|公告/.test(urlLower + titleLower) ||
    /cninfo\.com\.cn.*disclosure/.test(urlLower) ||
    /eastmoney\.com.*notice/.test(urlLower)
  ) {
    return 'announcement'
  }

  // 财报
  if (
    /financial.*report|earnings|caibao|财报|业绩/.test(urlLower + titleLower + contentSample) ||
    /eastmoney\.com.*bbsj/.test(urlLower) // 东方财富财报
  ) {
    return 'financial_report'
  }

  // 社区讨论
  if (
    /guba|tieba|xueqiu\.com\/(s|p|u)/.test(urlLower) ||
    /股吧|论坛|讨论/.test(titleLower) ||
    /xueqiu\.com/.test(urlLower) // 雪球默认社区
  ) {
    return 'community'
  }

  // 新闻
  if (
    /news|xinwen|新闻|报道/.test(urlLower + titleLower) ||
    /10jqka\.com\.cn.*news/.test(urlLower) ||
    /eastmoney\.com.*a\//.test(urlLower) // 东方财富资讯
  ) {
    return 'news'
  }

  // 默认通用
  return 'general'
}

/**
 * 截断内容到指定长度
 * 优先保留开头和结尾
 */
function truncateContent(content: string, maxLen: number): { text: string; truncated: boolean } {
  if (content.length <= maxLen) {
    return { text: content, truncated: false }
  }

  // 简单截断：保留前 70% 和后 30%
  const headLen = Math.floor(maxLen * 0.7)
  const tailLen = maxLen - headLen
  const head = content.slice(0, headLen)
  const tail = content.slice(content.length - tailLen)
  const text = `${head}\n\n... [内容已截断，中间省略] ...\n\n${tail}`

  return { text, truncated: true }
}
