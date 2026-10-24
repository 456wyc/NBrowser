import type { WebContents } from 'electron'
import type { AiAnalysisResult, AiAnalysisView, AnalysisMode } from '@shared/ipc'
import { LLMClient } from './llm-client'
import { AiAnalyzer, type AnalysisResult } from './analyzer'
import { getConfig, updateConfig } from '../config'
import { getDb } from '../db'
import {
  saveAnalysis,
  getAnalysesBySymbol,
  getRecentAnalyses,
  deleteAnalysis,
  type AiAnalysisRecord,
} from '../db/ai-analyses'
import { extractPageContent } from '../browser/content-extractor'
import { extractStockFromText } from '../stock-extractor'

/**
 * AI 服务
 * 编排：读取配置 -> 抓取正文 -> 调用 LLM -> 落库 -> 返回视图
 *
 * 每次调用都重新读取配置，用户在设置页改完配置后立即生效，无需重启。
 */
export class AiService {
  /**
   * 分析当前页面（从 WebContents 抓取正文）
   */
  async analyzeWebContents(
    webContents: WebContents,
    mode: AnalysisMode = 'page'
  ): Promise<AiAnalysisView> {
    const content = await extractPageContent(webContents)

    if (!content.text || content.text.trim().length < 20) {
      throw new Error('未能从该页面提取到有效正文，可能页面尚未加载完成或内容由脚本动态渲染')
    }

    const analysis = await this.runAnalysis({
      url: content.url,
      title: content.title,
      content: content.text,
      mode,
    })

    return this.persist(analysis, mode)
  }

  /**
   * 分析给定文本（选中文本 / 剪藏 / 粘贴内容）
   */
  async analyzeText(params: {
    text: string
    title?: string
    url?: string
    symbol?: string
  }): Promise<AiAnalysisView> {
    const text = (params.text || '').trim()
    if (text.length < 10) {
      throw new Error('文本太短，无法分析')
    }

    const title = params.title?.trim() || text.slice(0, 30)
    const url = params.url || ''

    // 股票关联：优先用调用方指定的，否则从标题/正文推断
    let symbol = params.symbol || null
    if (!symbol) {
      const candidates = extractStockFromText(title, text)
      symbol = candidates.length > 0 ? candidates[0] : null
    }

    const analysis = await this.runAnalysis({ url, title, content: text, mode: 'selection' })

    // 文本模式下 URL 里没有代码，用推断结果覆盖
    if (symbol) {
      analysis.symbol = symbol
    }

    return this.persist(analysis, 'selection')
  }

  /**
   * 历史分析记录
   */
  async getHistory(params: { symbol?: string; limit?: number } = {}): Promise<AiAnalysisView[]> {
    const db = await getDb()
    const records = params.symbol
      ? getAnalysesBySymbol(db, params.symbol)
      : getRecentAnalyses(db, params.limit ?? 20)

    return records.map(toView).filter(Boolean) as AiAnalysisView[]
  }

  /**
   * 删除一条分析记录
   */
  async deleteRecord(id: number): Promise<boolean> {
    const db = await getDb()
    return deleteAnalysis(db, id)
  }

  /**
   * 读取 LLM 配置（不下发 apiKey 明文，只告知是否已配置）
   */
  getPublicConfig(): { baseUrl: string; model: string; fastModel: string; hasApiKey: boolean } {
    const cfg = getConfig()
    return {
      baseUrl: cfg.llm.baseUrl,
      model: cfg.llm.model,
      fastModel: cfg.llm.fastModel || '',
      hasApiKey: Boolean(cfg.llm.apiKey),
    }
  }

  /**
   * 更新 LLM 配置（局部更新，未提供的字段保持不变）
   */
  setConfig(params: { baseUrl?: string; apiKey?: string; model?: string; fastModel?: string }): void {
    const current = getConfig()
    updateConfig({
      llm: {
        baseUrl: params.baseUrl?.trim() || current.llm.baseUrl,
        apiKey: params.apiKey !== undefined ? params.apiKey.trim() : current.llm.apiKey,
        model: params.model?.trim() || current.llm.model,
        // 轻量模型可随时清空（留空 = 关闭路由），清空时不能回退成主模型
        fastModel: params.fastModel !== undefined ? params.fastModel.trim() : current.llm.fastModel,
      },
    })
  }

  // ---------- 内部 ----------

  private async runAnalysis(params: {
    url: string
    title: string
    content: string
    mode: AnalysisMode
  }) {
    const cfg = getConfig()
    const client = new LLMClient({
      baseUrl: cfg.llm.baseUrl,
      apiKey: cfg.llm.apiKey,
      model: cfg.llm.model,
    })
    const analyzer = new AiAnalyzer(client)
    return analyzer.analyze(params)
  }

  private async persist(
    analysis: AnalysisResult,
    mode: AnalysisMode
  ): Promise<AiAnalysisView> {
    const db = await getDb()
    const id = saveAnalysis(db, {
      url: analysis.url,
      symbol: analysis.symbol,
      page_type: analysis.pageType,
      input_excerpt: analysis.inputExcerpt,
      result: analysis.result,
    })

    return {
      id,
      url: analysis.url,
      title: analysis.title,
      symbol: analysis.symbol,
      pageType: analysis.pageType,
      mode,
      result: analysis.result,
      created_at: Date.now(),
    }
  }
}

/**
 * 数据库记录 -> 视图对象
 */
function toView(record: AiAnalysisRecord): AiAnalysisView | null {
  let result: AiAnalysisResult
  try {
    result = JSON.parse(record.result_json) as AiAnalysisResult
  } catch {
    return null
  }

  return {
    id: record.id,
    url: record.url,
    title: titleFromResult(result) || record.url,
    symbol: record.symbol,
    pageType: normalizePageType(record.page_type),
    mode: 'page',
    result,
    created_at: record.created_at,
  }
}

function titleFromResult(result: AiAnalysisResult): string {
  return (result?.summary || '').slice(0, 40)
}

function normalizePageType(raw: string): AiAnalysisView['pageType'] {
  const allowed: AiAnalysisView['pageType'][] = [
    'announcement',
    'news',
    'financial_report',
    'community',
    'general',
  ]
  return allowed.includes(raw as any) ? (raw as AiAnalysisView['pageType']) : 'general'
}

// 导出单例，供 IPC handlers 使用
export const aiService = new AiService()
