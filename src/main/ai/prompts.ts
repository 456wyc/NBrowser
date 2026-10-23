import type { PageType } from './types'

/**
 * Prompt 模板
 * 所有模板都遵循以下硬性规则：
 * 1. 禁止预测价格、给出买入卖出建议或目标价
 * 2. 所有数据必须来自原文，没有的写入 uncertainties
 * 3. 输出严格为 JSON，格式固定
 * 4. 社区讨论类标记为 opinion
 */

const BASE_INSTRUCTIONS = `你是一个信息整理助手，你的任务是从给定的文本中提取和整理关键信息。

严格遵守以下规则：
1. 绝对禁止预测股票价格、给出买入/卖出/持有建议、或给出目标价。
2. 所有信息必须完全来自提供的原文。原文中没有提到的信息，不要推测、不要补充、不要编造，一律写入 uncertainties 字段。
3. 用中文回答。
4. 只输出 JSON，不要输出任何解释、Markdown 代码块标记或其他文字。
5. JSON 结构必须与下面的 schema 完全一致。`

const OUTPUT_SCHEMA = `输出 JSON 结构：
{
  "summary": "string // 页面核心事实摘要，不超过150字",
  "bullish": [
    {
      "point": "string // 利好因素的一句话概括",
      "evidence": "string // 原文中的具体依据，直接引用或精确复述"
    }
  ],
  "bearish": [
    {
      "point": "string // 利空因素的一句话概括",
      "evidence": "string // 原文中的具体依据"
    }
  ],
  "key_data": [
    {
      "name": "string // 数据名称，如\"营收\"、\"净利润\"",
      "value": "string // 具体数值，带单位",
      "period": "string // 可选，所属期间，如\"2024Q3\""
    }
  ],
  "uncertainties": [
    "string // 原文没有说明或需要进一步核实的问题"
  ],
  "source_type": "fact | opinion // fact=公告/财报等事实类，opinion=社区讨论等观点类"
}`

/**
 * 根据页面类型获取对应的系统 Prompt
 */
export function getSystemPrompt(pageType: PageType, isTruncated: boolean): string {
  let typeInstruction = ''

  switch (pageType) {
    case 'announcement':
      typeInstruction = `\n这是一份上市公司公告，属于事实类信息。请客观整理公告中的关键内容。\nsource_type 字段填 "fact"。`
      break
    case 'news':
      typeInstruction = `\n这是一篇财经新闻。请整理新闻中的核心事实和各方观点。\nsource_type 字段填 "fact"。`
      break
    case 'financial_report':
      typeInstruction = `\n这是一份财报或财务数据。请重点提取关键财务指标和同比/环比变化。\nsource_type 字段填 "fact"。`
      break
    case 'community':
      typeInstruction = `\n这是社区讨论帖，属于个人观点，不代表事实。请区分观点和事实，并在界面上明确提示用户这是观点而非事实。\nsource_type 字段填 "opinion"。`
      break
    case 'general':
    default:
      typeInstruction = `\n无法判断页面类型，请按通用方式整理。\n如果内容主要是事实（公告、财报、新闻报道），source_type 填 "fact"。\n如果内容主要是个人观点、评论、讨论，source_type 填 "opinion"。`
      break
  }

  const truncatedNote = isTruncated
    ? '\n注意：提供的内容已被截断（原文太长），你的分析只能基于给出的部分内容，并在 uncertainties 中说明"内容已截断，可能不完整"。'
    : ''

  return `${BASE_INSTRUCTIONS}${typeInstruction}${truncatedNote}\n\n${OUTPUT_SCHEMA}`
}

/**
 * 用户消息（要分析的内容）
 */
export function buildUserPrompt(title: string, content: string, mode: 'page' | 'selection'): string {
  const modeLabel = mode === 'page' ? '页面标题' : '选中文本'
  return `请分析以下${mode === 'page' ? '网页' : '文本'}内容：

【${modeLabel}】${title}

【正文】
${content}

请按要求输出 JSON。`
}
