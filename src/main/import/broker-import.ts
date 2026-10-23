/**
 * 券商交割单 / 对账单导入解析
 *
 * 设计：
 * 1) parseBrokerStatement —— 通用表头关键字识别（离线、可单测），适配大多数券商 CSV/TSV。
 * 2) parseBrokerStatementWithLLM —— 当启发式解析不出结果时，用大模型兜底解析任意文本
 *    （粘贴的网页内容、HTML 等）。需配置 API Key。
 */

import type { TradeSide } from '../db/trades'

export interface ParsedTrade {
  symbol: string
  name: string
  side: TradeSide
  price: number
  quantity: number
  amount: number | null
  fee: number
  tradedAt: number
  raw?: Record<string, string>
}

export interface ParseResult {
  trades: ParsedTrade[]
  method: 'heuristic' | 'llm'
  unmatched: string[] // 未识别的列名
  warnings: string[]
}

// 各字段的关键字别名（小写匹配，包含即命中）
const ALIASES: Record<string, string[]> = {
  date: ['成交日期', '交易日期', '日期', '成交时间', '交易时间', '时间', '委托时间', '委托日期', '日期时间', 'date', 'time', 'datetime'],
  code: ['证券代码', '股票代码', '代码', '股票编号', 'symbol', 'code', 'stockcode', 'secucode', 'secid'],
  name: ['证券名称', '股票名称', '名称', '证券简称', 'name', 'stockname'],
  side: ['买卖标志', '交易方向', '方向', '业务标志', '业务类型', '操作', '买卖', '成交类型', 'side', 'direction', 'bs', '委托方向', '交易类别'],
  price: ['成交价格', '价格', '成交价', '单价', 'tradeprice', 'price'],
  quantity: ['成交数量', '数量', '股数', '成交量', '成交股数', 'quantity', 'shares', 'vol', 'volume', 'qty'],
  amount: ['成交金额', '金额', '成交总额', '总额', '成交额', 'amount', 'turnover'],
  fee: ['手续费', '佣金', '费用', '印花税', '交易费', '规费', 'fee', 'commission'],
}

function matchColumn(header: string): string | null {
  const s = header.trim().toLowerCase()
  for (const key of Object.keys(ALIASES)) {
    if (ALIASES[key].some((a) => s.includes(a.toLowerCase()))) return key
  }
  return null
}

function detectDelimiter(line: string): string {
  const candidates = [',', '\t', ';', '|']
  let best = ','
  let bestCount = -1
  for (const c of candidates) {
    const n = line.split(c).length - 1
    if (n > bestCount) {
      bestCount = n
      best = c
    }
  }
  return best
}

/** 支持带双引号的简单 CSV 拆分 */
function splitLine(line: string, delim: string): string[] {
  if (!line.includes('"')) return line.split(delim).map((s) => s.trim())
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

function normalizeSymbol(raw: string): string {
  if (!raw) return ''
  let s = raw.trim().toUpperCase()
  s = s.replace(/^(SH|SZ|BJ|SH\.|SZ\.|BJ\.)/, '')
  const digits = s.replace(/\D/g, '')
  return digits.length >= 4 ? digits : s.replace(/[.\s]/g, '')
}

function parseSide(raw: string): TradeSide | null {
  const s = raw.trim().toLowerCase()
  if (/买|买入|证券买入|buy|^b$|订阅买入/.test(s)) return 'buy'
  if (/卖|卖出|证券卖出|sell|^s$|订阅卖出/.test(s)) return 'sell'
  return null
}

function parseNumber(raw: string): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s)
  s = s.replace(/[¥￥$,%\s]/g, '').replace(/[（）()]/g, '')
  if (neg) s = '-' + s
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseDate(raw: string): number | null {
  if (!raw) return null
  const s = raw.trim().replace(/\u3000/g, ' ')
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (m) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 15, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
    if (!isNaN(dt.getTime())) return dt.getTime()
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3], 15, 0, 0)
    if (!isNaN(dt.getTime())) return dt.getTime()
  }
  const t = Date.parse(s)
  return isNaN(t) ? null : t
}

/**
 * 通用表头关键字识别解析（离线、可单测）
 */
export function parseBrokerStatement(text: string): ParseResult {
  const warnings: string[] = []
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { trades: [], method: 'heuristic', unmatched: [], warnings: ['内容行数不足，无法解析（至少需要表头 + 1 行数据）'] }
  }

  const delim = detectDelimiter(lines[0])
  const header = splitLine(lines[0], delim)
  const colMap: Record<string, number> = {}
  const unmatched: string[] = []
  header.forEach((h, i) => {
    const key = matchColumn(h)
    if (key) {
      if (!(key in colMap)) colMap[key] = i
    } else {
      unmatched.push(h)
    }
  })

  const required = ['date', 'code', 'side', 'price', 'quantity']
  const missing = required.filter((k) => !(k in colMap))
  if (missing.length > 0) {
    return { trades: [], method: 'heuristic', unmatched, warnings: [`未识别到必要列: ${missing.join('、')}（可尝试粘贴原始文本用大模型解析）`] }
  }

  const trades: ParsedTrade[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = splitLine(lines[r], delim)
    const get = (k: string): string => cells[colMap[k]] ?? ''
    const symbol = normalizeSymbol(get('code'))
    const side = parseSide(get('side'))
    const price = parseNumber(get('price'))
    const quantity = parseNumber(get('quantity'))
    const tradedAt = parseDate(get('date'))

    if (!symbol || !side || price == null || quantity == null || tradedAt == null) {
      warnings.push(`第 ${r} 行字段不完整，已跳过`)
      continue
    }

    const raw: Record<string, string> = {}
    header.forEach((h, i) => {
      raw[h] = cells[i] ?? ''
    })

    trades.push({
      symbol,
      name: get('name').trim(),
      side,
      price,
      quantity,
      amount: parseNumber(get('amount')),
      fee: parseNumber(get('fee')) ?? 0,
      tradedAt,
      raw,
    })
  }

  trades.sort((a, b) => a.tradedAt - b.tradedAt)
  return { trades, method: 'heuristic', unmatched, warnings: warnings.slice(0, 20) }
}

/**
 * 大模型兜底解析：把任意交割单文本交给 LLM 抽取为结构化成交
 */
export async function parseBrokerStatementWithLLM(
  text: string,
  client: { completeJson: (system: string, user: string) => Promise<any> }
): Promise<ParsedTrade[]> {
  const system =
    '你是股票交易数据提取助手。用户会提供券商交割单或对账单文本（可能是 CSV、表格或网页复制内容）。' +
    '请提取每一笔成交，只输出严格 JSON，格式：' +
    '{"trades":[{"symbol":"6位股票代码","name":"证券名称","side":"buy或sell",' +
    '"price":数字,"quantity":整数股数,"fee":数字手续费,"tradedAt":"YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD",' +
    '"amount":数字成交金额}]}。无法识别的字段留空或省略。不要输出 JSON 以外的任何内容。'

  const data = await client.completeJson(system, text.slice(0, 12000))
  const arr = data?.trades
  if (!Array.isArray(arr)) return []

  const out: ParsedTrade[] = []
  for (const t of arr) {
    const symbol = normalizeSymbol(String(t.symbol ?? ''))
    const side = parseSide(String(t.side ?? ''))
    const price = parseNumber(String(t.price ?? ''))
    const quantity = parseNumber(String(t.quantity ?? ''))
    const tradedAt = parseDate(String(t.tradedAt ?? ''))
    if (!symbol || !side || price == null || quantity == null || tradedAt == null) continue
    out.push({
      symbol,
      name: String(t.name ?? ''),
      side,
      price,
      quantity,
      amount: parseNumber(String(t.amount ?? '')),
      fee: parseNumber(String(t.fee ?? '')) ?? 0,
      tradedAt,
    })
  }
  return out
}
