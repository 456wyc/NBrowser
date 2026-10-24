import { net } from 'electron'
import { guessMarket } from '@shared/stock-market'
import type { QuoteProvider, Quote, SearchResult, KLine, KLinePeriod } from './provider'
import { searchSymbolsEastmoney } from './search-symbols'
import { EastmoneyProvider } from './eastmoney-provider'

/**
 * 通用自定义行情 Provider（可配置接入任意 HTTP JSON API）
 *
 * 用于接入需要 API Key 的商业数据源（TickFlow、聚源、Tushare Pro 兼容网关等），
 * 或任何自建行情网关。用户只需配置：
 * - quoteUrl：行情 URL 模板，支持 {codes}（逗号分隔原始代码）/{code}（单个）
 * - klineUrl：K 线 URL 模板（可选，支持 {code} {period} {limit}；留空则 K 线回退东财）
 * - quoteArrayPath：响应中行情数组的路径（点号，支持索引，如 data.list；留空自动探测）
 * - fieldMap：Quote 各字段在数组元素中的路径（点号，支持索引）
 * - headers：自定义请求头（放 Authorization / API Key）
 *
 * 设计原则：不猜任何厂商的协议细节，全部由配置驱动；
 * 解析逻辑是纯函数（resolvePath / fillTemplate / parseCustomQuotes），可单测。
 */

export interface CustomQuoteConfig {
  quoteUrl: string
  klineUrl?: string
  quoteArrayPath?: string
  fieldMap: {
    code?: string
    name?: string
    price?: string
    changePercent?: string
    changeAmount?: string
    open?: string
    prevClose?: string
    high?: string
    low?: string
    volume?: string
    amount?: string
  }
  headers?: Record<string, string>
}

/** 按点号路径取值，支持数组索引：'data.list.0.price' */
export function resolvePath(obj: any, path: string): any {
  if (!path) return undefined
  let cur = obj
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[seg]
  }
  return cur
}

/** 替换 URL 模板占位符 */
export function fillTemplate(
  url: string,
  vars: { codes?: string; code?: string; period?: string; limit?: string }
): string {
  return url
    .replace(/\{codes\}/g, encodeURIComponent(vars.codes ?? ''))
    .replace(/\{code\}/g, encodeURIComponent(vars.code ?? ''))
    .replace(/\{period\}/g, encodeURIComponent(vars.period ?? ''))
    .replace(/\{limit\}/g, encodeURIComponent(vars.limit ?? ''))
}

/** 在响应 JSON 中定位行情数组：优先配置路径，否则自动探测第一个「元素为对象的数组」 */
export function locateQuoteArray(json: any, arrayPath?: string): any[] {
  if (arrayPath) {
    const arr = resolvePath(json, arrayPath)
    return Array.isArray(arr) ? arr : []
  }
  return findFirstObjectArray(json, 0)
}

function findFirstObjectArray(node: any, depth: number): any[] {
  if (depth > 4 || node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) {
    return node.length > 0 && typeof node[0] === 'object' && node[0] !== null ? node : []
  }
  for (const key of Object.keys(node)) {
    const found = findFirstObjectArray(node[key], depth + 1)
    if (found.length > 0) return found
  }
  return []
}

function num(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: any): string {
  return v === null || v === undefined ? '' : String(v)
}

/**
 * 把自定义 API 的数组元素映射为 Quote[]（纯函数）。
 * code 缺失时按请求顺序回填（要求数组顺序与请求 codes 一致——多数批量接口如此）。
 */
export function parseCustomQuotes(
  rows: any[],
  cfg: CustomQuoteConfig,
  requestedCodes: string[],
  timestamp: number
): Quote[] {
  const out: Quote[] = []
  rows.forEach((row, i) => {
    const fm = cfg.fieldMap || {}
    const rawCode = fm.code ? str(resolvePath(row, fm.code)) : ''
    // 代码规范化：带后缀纠正；裸 6 位补后缀；都拿不到就按请求顺序回填
    let symbol = ''
    if (rawCode) {
      if (/^\d{6}$/.test(rawCode)) {
        const m = guessMarket(rawCode)
        symbol = m ? `${rawCode}.${m}` : ''
      } else if (/^\d{6}\.(SH|SZ|BJ)$/i.test(rawCode)) {
        const [c, mk] = rawCode.split('.')
        const m = guessMarket(c)
        symbol = `${c}.${m || mk.toUpperCase()}`
      }
    }
    if (!symbol) symbol = requestedCodes[i] ?? ''
    if (!symbol) return

    const price = num(fm.price ? resolvePath(row, fm.price) : undefined)
    out.push({
      symbol,
      name: (fm.name ? str(resolvePath(row, fm.name)) : '') || symbol,
      price,
      changePercent: num(fm.changePercent ? resolvePath(row, fm.changePercent) : undefined),
      changeAmount: num(fm.changeAmount ? resolvePath(row, fm.changeAmount) : undefined),
      open: num(fm.open ? resolvePath(row, fm.open) : undefined),
      prevClose: num(fm.prevClose ? resolvePath(row, fm.prevClose) : undefined),
      high: num(fm.high ? resolvePath(row, fm.high) : undefined),
      low: num(fm.low ? resolvePath(row, fm.low) : undefined),
      volume: num(fm.volume ? resolvePath(row, fm.volume) : undefined),
      amount: num(fm.amount ? resolvePath(row, fm.amount) : undefined),
      timestamp,
    })
  })
  return out
}

export class CustomHttpProvider implements QuoteProvider {
  readonly name = 'custom'
  /** K 线未配置时的回退源（策略回测/运行依赖 K 线，不能因只配了行情就失效） */
  private fallback = new EastmoneyProvider()

  constructor(private config: CustomQuoteConfig) {}

  async getQuotes(codes: string[]): Promise<Quote[]> {
    if (codes.length === 0) return []
    if (!this.config.quoteUrl?.trim()) throw new Error('自定义数据源未配置行情 URL')

    const url = fillTemplate(this.config.quoteUrl.trim(), { codes: codes.join(',') })
    const response = await net.fetch(url, { headers: this.headers() })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const json = await response.json()
    const rows = locateQuoteArray(json, this.config.quoteArrayPath)
    if (rows.length === 0) throw new Error('自定义数据源未返回行情数组（检查 quoteArrayPath 配置）')
    return parseCustomQuotes(rows, this.config, codes, Date.now())
  }

  async searchSymbol(keyword: string): Promise<SearchResult[]> {
    return searchSymbolsEastmoney(keyword)
  }

  async getKLine(code: string, period: KLinePeriod = 'day', limit = 250): Promise<KLine[]> {
    if (!this.config.klineUrl?.trim()) {
      // 未配置 K 线：回退东财（历史 K 线与实时行情源本就可解耦）
      return this.fallback.getKLine(code, period, limit)
    }
    const url = fillTemplate(this.config.klineUrl.trim(), {
      code,
      period,
      limit: String(limit),
    })
    const response = await net.fetch(url, { headers: this.headers() })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const json = await response.json()
    const rows = locateQuoteArray(json, undefined)
    // 约定：K 线数组元素为 [时间, 开, 收, 高, 低, 量]（与常见网关一致）
    const out: KLine[] = []
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 5) continue
      const ts = typeof row[0] === 'number' ? row[0] : Date.parse(String(row[0]))
      if (!Number.isFinite(ts)) continue
      out.push({
        ts,
        open: num(row[1]),
        close: num(row[2]),
        high: num(row[3]),
        low: num(row[4]),
        volume: num(row[5]),
      })
    }
    return out.sort((a, b) => a.ts - b.ts)
  }

  private headers(): Record<string, string> {
    return {
      'User-Agent': 'stock-agent-browser',
      ...(this.config.headers || {}),
    }
  }
}
