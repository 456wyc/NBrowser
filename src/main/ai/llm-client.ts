import { net } from 'electron'
import type { AiAnalysisResult } from './types'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * LLM 客户端
 * 使用 OpenAI 兼容的 Chat Completions API
 */
export class LLMClient {
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  /**
   * 调用 LLM 并解析为 AiAnalysisResult
   */
  async analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置，请在设置中填写')
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`

    const body = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // 低温度，更稳定的输出
      response_format: { type: 'json_object' }, // 要求 JSON 输出
    })

    try {
      const response = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('API 返回内容为空')
      }

      return this.parseJsonResponse(content)
    } catch (err: any) {
      console.error('[ai] LLM call failed:', err.message)
      throw err
    }
  }

  /**
   * 通用文本对话（不要求 JSON），用于笔记讨论 / 知识库问答等自由对话场景
   */
  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置，请在设置中填写')
    }
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = JSON.stringify({
      model: this.config.model,
      messages,
      temperature: 0.7,
    })

    try {
      const response = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('API 返回内容为空')
      }
      return content
    } catch (err: any) {
      console.error('[ai] LLM chat failed:', err.message)
      throw err
    }
  }

  /**
   * 通用 JSON 补全（不绑定分析结构，供任意结构化抽取，如券商交割单解析）
   */
  async completeJson(systemPrompt: string, userPrompt: string): Promise<any> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置，请在设置中填写')
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`

    const body = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })

    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 500)}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('API 返回内容为空')
    }

    let cleaned = content.trim()
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim()
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```$/, '').trim()
    return JSON.parse(cleaned)
  }

  /**
   * 解析 LLM 返回的 JSON
   * 解析失败时抛出错误，由上层决定降级策略
   */
  private parseJsonResponse(content: string): AiAnalysisResult {
    // 清理可能的 Markdown 代码块标记
    let cleaned = content.trim()
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim()
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```$/, '').trim()

    const parsed = JSON.parse(cleaned)

    // 基本字段校验
    if (typeof parsed.summary !== 'string') {
      throw new Error('响应缺少 summary 字段')
    }
    if (!Array.isArray(parsed.bullish)) parsed.bullish = []
    if (!Array.isArray(parsed.bearish)) parsed.bearish = []
    if (!Array.isArray(parsed.key_data)) parsed.key_data = []
    if (!Array.isArray(parsed.uncertainties)) parsed.uncertainties = []
    if (parsed.source_type !== 'fact' && parsed.source_type !== 'opinion') {
      parsed.source_type = 'fact' // 默认事实类
    }

    return parsed as AiAnalysisResult
  }
}
