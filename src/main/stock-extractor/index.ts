import { urlPatterns } from './url-patterns'
import { guessMarket, isStockCodePrefix } from './market'

/**
 * 从 URL 中提取股票代码
 * 按站点 URL 规则匹配，返回标准格式的股票代码（如 600519.SH）
 * 识别不到返回 null
 *
 * 纯函数：相同输入永远返回相同输出，无副作用
 */
export function extractStockFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null

  for (const pattern of urlPatterns) {
    const result = pattern.match(url)
    if (result) {
      return result
    }
  }

  return null
}

/**
 * 从标题和正文中提取股票代码
 * 匹配 6 位数字代码（A 股），可选匹配股票名称
 *
 * 纯函数：相同输入永远返回相同输出，无副作用
 *
 * @param title 页面标题
 * @param text  页面正文片段（可选）
 * @returns 股票代码数组（可能多个），标准格式如 ['600519.SH']
 */
export function extractStockFromText(title: string, text: string = ''): string[] {
  const results: Set<string> = new Set()

  // 匹配「股票名称(6位代码)」或「6位代码」模式
  // 先匹配标题（标题里的代码更相关）
  const codesFromTitle = findStockCodes(title)
  codesFromTitle.forEach((code) => results.add(code))

  // 再匹配正文（如果提供了的话）
  if (text) {
    const codesFromText = findStockCodes(text)
    codesFromText.forEach((code) => results.add(code))
  }

  return Array.from(results)
}

/**
 * 在文本中查找所有 6 位股票代码并加上市场后缀
 */
function findStockCodes(text: string): string[] {
  if (!text) return []

  const results: string[] = []
  const seen = new Set<string>()

  // 匹配 6 位数字，且前后不是数字（避免匹配更长的数字串）
  // 比如"贵州茅台(600519)"、"600519 贵州茅台"、"代码：600519"
  const regex = /(?<!\d)(\d{6})(?!\d)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const code = match[1]
    if (isLikelyStockCode(code) && !seen.has(code)) {
      seen.add(code)
      const withMarket = addMarketIfLikely(code, text)
      if (withMarket) {
        results.push(withMarket)
      }
    }
  }

  return results
}

/**
 * 判断 6 位数字是否像 A 股股票代码
 * 代码前缀规则见 market.ts（单一来源）
 */
function isLikelyStockCode(code: string): boolean {
  if (code.length !== 6) return false
  // 排除全 0
  if (/^0+$/.test(code)) return false
  // 排除年份：19xxxx / 20xxxx
  if (code.startsWith('19') || code.startsWith('20')) return false
  // 排除全相同数字的占位串（111111、555555 等）
  if (/^(\d)\1{5}$/.test(code)) return false

  // 匹配 A 股常见代码前缀
  return isStockCodePrefix(code)
}

/**
 * 根据上下文推断市场（如果文本中明确提到了沪/深/京等字样）
 * 推断不出来时根据代码前缀猜
 */
function addMarketIfLikely(code: string, context: string): string | null {
  if (!isLikelyStockCode(code)) return null

  // 先看上下文中有没有明确的市场标记
  // 比如"沪市600519"、"深交所000001"、"SH600519"、"sz000001"
  const index = context.indexOf(code)
  if (index > 0) {
    // 取代码前后各 10 个字符看看
    const prefix = context.substring(Math.max(0, index - 12), index).toLowerCase()
    if (/sh|沪|上交所|上证|主板.*6|沪市/.test(prefix)) {
      return `${code}.SH`
    }
    if (/sz|深|深交所|深证|创业板|中小板|深市/.test(prefix)) {
      return `${code}.SZ`
    }
    if (/bj|京|北交|北证/.test(prefix)) {
      return `${code}.BJ`
    }
  }

  // 没有明确标记，按代码前缀推断
  const market = guessMarket(code)
  return market ? `${code}.${market}` : null
}
