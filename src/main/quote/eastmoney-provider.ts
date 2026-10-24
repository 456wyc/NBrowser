import { net } from 'electron'
import { normalizeSymbol } from '@shared/stock-market'
import type { QuoteProvider, Quote, SearchResult, KLine, KLinePeriod } from './provider'
import { searchSymbolsEastmoney } from './search-symbols'

/**
 * 东方财富行情 Provider
 * 使用东方财富公开行情接口，免费、无需 Key、支持批量查询
 *
 * 代码格式转换：
 * - 内部格式：600519.SH / 000001.SZ
 * - 东方财富格式：1.600519（沪市前缀1） / 0.000001（深市前缀0） / 0.30xxxx（创业板）
 * 内部代码的市场后缀以代码前缀为准进行规范化，可修正错误后缀（如 301235.SH）。
 */
export class EastmoneyProvider implements QuoteProvider {
  readonly name = 'eastmoney'

  async getQuotes(codes: string[]): Promise<Quote[]> {
    if (codes.length === 0) return []

    // 转换为东方财富的代码格式
    const emCodes = codes.map((code) => toEastmoneyCode(code)).filter(Boolean) as string[]
    if (emCodes.length === 0) return []

    const url =
      'https://push2.eastmoney.com/api/qt/ulist.np/get' +
      `?fltt=2&secids=${encodeURIComponent(emCodes.join(','))}` +
      '&fields=f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18'

    try {
      const response = await net.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://quote.eastmoney.com/',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data: EastmoneyListResponse = await response.json()

      if (!data?.data?.diff) return []

      const now = Date.now()
      return data.data.diff.map((item) => parseQuoteItem(item, now)).filter(Boolean) as Quote[]
    } catch (err) {
      console.error(`[quote] eastmoney getQuotes failed: ${err}`)
      throw err
    }
  }

  async searchSymbol(keyword: string): Promise<SearchResult[]> {
    // 搜索与行情源解耦，统一走东财 suggest（见 search-symbols.ts）
    return searchSymbolsEastmoney(keyword)
  }

  async getKLine(code: string, period: KLinePeriod = 'day', limit = 250): Promise<KLine[]> {
    const emCode = toEastmoneyCode(code)
    if (!emCode) return []

    // klt: 101=日 102=周 103=月；分钟线直接传分钟数（5/15/30/60）
    const klt = period === 'day' ? 101 : period === 'week' ? 102 : Number(period.replace('m', ''))
    const url =
      'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
      `?secid=${encodeURIComponent(emCode)}` +
      `&klt=${klt}&fqt=1&lmt=${limit}&end=20500101` +
      '&fields1=f1,f2,f3,f4,f5,f6' +
      '&fields2=f51,f52,f53,f54,f55,f56,f57'

    try {
      const response = await net.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://quote.eastmoney.com/',
        },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data: EastmoneyKlineResponse = await response.json()
      const lines = data?.data?.klines
      if (!Array.isArray(lines)) return []

      const out: KLine[] = []
      for (const line of lines) {
        const k = parseKlineItem(line)
        if (k) out.push(k)
      }
      return out.sort((a, b) => a.ts - b.ts)
    } catch (err) {
      console.error(`[quote] eastmoney getKLine failed: ${err}`)
      throw err
    }
  }
}

/**
 * 解析一行 K 线字符串
 * f51=日期 f52=开盘 f53=收盘 f54=最高 f55=最低 f56=成交量 f57=成交额
 */
function parseKlineItem(line: string): KLine | null {
  const parts = String(line).split(',')
  if (parts.length < 6) return null
  const ts = Date.parse(parts[0])
  if (!Number.isFinite(ts)) return null
  return {
    ts,
    open: toNumber(parts[1]),
    close: toNumber(parts[2]),
    high: toNumber(parts[3]),
    low: toNumber(parts[4]),
    volume: toNumber(parts[5]),
  }
}

// ---------- 工具函数 ----------

/**
 * 内部标准代码 -> 东方财富代码
 * 600519.SH -> 1.600519
 * 000001.SZ -> 0.000001
 */
function toEastmoneyCode(code: string): string | null {
  const normalized = normalizeSymbol(code)
  const parts = normalized.split('.')
  if (parts.length !== 2) return null
  const [num, market] = parts
  const marketPrefix = market === 'SH' ? '1' : market === 'SZ' ? '0' : market === 'BJ' ? '0' : null
  if (!marketPrefix) return null
  return `${marketPrefix}.${num}`
}

/**
 * 解析东方财富行情数据项
 * f2: 最新价, f3: 涨跌幅, f4: 涨跌额, f5: 成交量(手), f6: 成交额
 * f12: 代码, f14: 名称, f15: 最高, f16: 最低, f17: 开盘, f18: 昨收
 */
function parseQuoteItem(item: EastmoneyQuoteItem, timestamp: number): Quote | null {
  const price = toNumber(item.f2)
  const changePercent = toNumber(item.f3)
  const changeAmount = toNumber(item.f4)
  const prevClose = toNumber(item.f18)

  if (!item.f12) return null

  // 推断市场（代码开头）
  let market = 'SH'
  const code = item.f12
  if (code.startsWith('6') || code.startsWith('9')) {
    market = 'SH'
  } else if (code.startsWith('0') || code.startsWith('3')) {
    market = 'SZ'
  } else if (code.startsWith('4') || code.startsWith('8')) {
    market = 'BJ'
  }

  return {
    symbol: `${code}.${market}`,
    name: item.f14 || code,
    price,
    changePercent,
    changeAmount,
    open: toNumber(item.f17),
    prevClose,
    high: toNumber(item.f15),
    low: toNumber(item.f16),
    volume: toNumber(item.f5),
    amount: toNumber(item.f6),
    timestamp,
  }
}

function toNumber(val: any): number {
  if (val === null || val === undefined || val === '-') return 0
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

// ---------- 类型定义 ----------

interface EastmoneyListResponse {
  data?: {
    diff: EastmoneyQuoteItem[]
  }
}

interface EastmoneyQuoteItem {
  f2?: string | number // 最新价
  f3?: string | number // 涨跌幅
  f4?: string | number // 涨跌额
  f5?: string | number // 成交量(手)
  f6?: string | number // 成交额
  f12?: string // 代码
  f14?: string // 名称
  f15?: string | number // 最高
  f16?: string | number // 最低
  f17?: string | number // 今开
  f18?: string | number // 昨收
}

interface EastmoneyKlineResponse {
  data?: {
    /** 每行：日期,开,收,高,低,成交量,成交额,... */
    klines?: string[]
  }
}
