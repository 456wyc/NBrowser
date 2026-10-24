import { net } from 'electron'
import { guessMarket } from '@shared/stock-market'
import type { QuoteProvider, Quote, SearchResult, KLine, KLinePeriod } from './provider'
import { searchSymbolsEastmoney } from './search-symbols'

/**
 * 腾讯财经行情 Provider
 * 免费、无需 Key、单请求批量。
 *
 * 数据格式（qt.gtimg.cn，GBK 编码文本）：
 *   v_sh600519="1~贵州茅台~600519~1515.00~1453.00~...";
 * 字段下标（社区长期稳定口径）：1=名称 2=代码 3=现价 4=昨收 5=今开 6=成交量(手)
 * 30=时间 31=涨跌额 32=涨跌幅 33=最高 34=最低 37=成交额(万)
 *
 * K 线（web.ifzq.gtimg.cn，UTF-8 JSON）：
 *   param=sh600519,day,,,320,qfq → data.sh600519.qfqday = [[日期,开,收,高,低,成交量(手),…]]
 *
 * 股票搜索不重复实现：与东财 suggest 解耦（搜索与行情源本就关注点不同），
 * 见 search-symbols.ts。
 */

/** GBK 解码（Electron/Node 带完整 ICU；失败时退化为 utf-8，不让名称整块丢失） */
function decodeGbk(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

export class TencentProvider implements QuoteProvider {
  readonly name = 'tencent'

  async getQuotes(codes: string[]): Promise<Quote[]> {
    if (codes.length === 0) return []
    const symbols = codes.map((c) => toTencentCode(c)).filter(Boolean) as string[]
    if (symbols.length === 0) return []

    const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`
    const response = await net.fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://gu.qq.com/',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const text = decodeGbk(await response.arrayBuffer())
    const items = parseTencentQuoteText(text)
    if (items.length === 0) throw new Error('腾讯行情返回为空（接口可能变更或限流）')
    return items
  }

  async searchSymbol(keyword: string): Promise<SearchResult[]> {
    // 搜索统一走东财 suggest：与行情数据源解耦，任何行情源下搜索体验一致
    return searchSymbolsEastmoney(keyword)
  }

  async getKLine(code: string, period: KLinePeriod = 'day', limit = 250): Promise<KLine[]> {
    const symbol = toTencentCode(code)
    if (!symbol) return []
    // 周期：day/week → 日/周；分钟线 m5/m15/m60
    const k = period === 'day' ? 'day' : period === 'week' ? 'week' : period
    const url =
      'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get' +
      `?param=${symbol},${k},,,${limit},qfq`

    const response = await net.fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://gu.qq.com/',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    const rows = extractKlineRows(data, symbol, k)
    return rows.sort((a, b) => a.ts - b.ts)
  }
}

/** 内部标准代码 → 腾讯代码：600519.SH → sh600519 */
export function toTencentCode(code: string): string | null {
  const parts = code.split('.')
  if (parts.length !== 2) return null
  const [num, market] = parts
  const m = market.toLowerCase()
  if (m !== 'sh' && m !== 'sz' && m !== 'bj') return null
  return `${m}${num}`
}

/** 腾讯代码 → 内部标准代码：sh600519 → 600519.SH */
export function fromTencentCode(market: string, code: string): string | null {
  const m = market.toLowerCase()
  if (m !== 'sh' && m !== 'sz' && m !== 'bj') return null
  const upper = m.toUpperCase()
  // 用代码前缀推断纠正市场（腾讯偶尔把北交所标成 sz）
  const guessed = guessMarket(code)
  return `${code}.${guessed || upper}`
}

/**
 * 解析 qt.gtimg.cn 的 GBK 文本为 Quote[]（纯函数，供单测）。
 * 逐行匹配 v_xxNNNNNN="字段~字段~..."。
 */
export function parseTencentQuoteText(text: string): Quote[] {
  const out: Quote[] = []
  const re = /v_([a-z]{2})(\d{6})="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const [, market, code, payload] = m
    const symbol = fromTencentCode(market, code)
    if (!symbol) continue
    const f = payload.split('~')
    const price = num(f[3])
    if (price <= 0 && !f[30]) continue // 停牌/无数据行跳过（无时间戳的行不是有效行情）
    out.push({
      symbol,
      name: f[1] || code,
      price,
      changePercent: num(f[32]),
      changeAmount: num(f[31]),
      open: num(f[5]),
      prevClose: num(f[4]),
      high: num(f[33]),
      low: num(f[34]),
      volume: num(f[6]) || num(f[36]),
      amount: num(f[37]) * 10000, // 万元 → 元
      timestamp: parseTencentTime(f[30]),
    })
  }
  return out
}

/** '20261024103000' → 毫秒时间戳；解析失败返回 0 */
export function parseTencentTime(raw: string | undefined): number {
  const s = String(raw ?? '')
  if (!/^\d{14}$/.test(s)) return 0
  const d = new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
    Number(s.slice(12, 14))
  )
  return d.getTime()
}

/** 从 fqkline 响应里取出 K 线数组（纯函数）。兼容 qfqday/qfqweek/day/week/m5 等键名 */
export function extractKlineRows(data: any, symbol: string, period: string): KLine[] {
  const stock = data?.data?.[symbol]
  if (!stock) return []
  // 优先带复权前缀的键，其次裸键
  const rows: any[] | undefined = stock[`qfq${period}`] ?? stock[period]
  if (!Array.isArray(rows)) return []
  const out: KLine[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const ts = parseKlineDate(row[0])
    if (!ts) continue
    out.push({
      ts,
      open: num(row[1]),
      close: num(row[2]),
      high: num(row[3]),
      low: num(row[4]),
      volume: num(row[5]),
    })
  }
  return out
}

/** '2024-01-02' / '2024-01-02 14:35' → 毫秒 */
export function parseKlineDate(raw: unknown): number {
  const s = String(raw ?? '')
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (!m) return 0
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0)
  ).getTime()
}

function num(v: any): number {
  if (v === null || v === undefined || v === '' || v === '-') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
