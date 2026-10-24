/**
 * 交易自然语言录入：把用户大白话（"今天 14:32 以 1500.5 买入贵州茅台 100 股，手续费 5 元"）
 * 交给大模型解析为结构化成交记录，经 sanitize 严格校验后供用户预览确认。
 *
 * 设计：
 * - 系统提示要求模型把「今天/昨天/9 月 3 日」等相对时间基于调用方提供的当前时间解析为绝对时间；
 * - sanitize 是纯函数：字段缺失/非法的一律丢弃该条，绝不放脏数据进库；
 * - 解析结果一律走「预览勾选 → 用户确认 → 入库」，与交割单导入同一条确认链路。
 */

import type { ParsedTrade } from '@shared/ipc'

/** 系统提示：固定 JSON schema + 交易日惯例（A 股 100 股整数倍等作为软提示，不作硬校验） */
export function naturalTradeSystemPrompt(): string {
  return (
    '你是股票交易记录提取助手。用户会用大白话描述一笔或多笔成交（可能是一次输入多笔）。' +
    '请提取每一笔，只输出严格 JSON，格式：' +
    '{"trades":[{"symbol":"6位股票代码","name":"证券名称","side":"buy或sell",' +
    '"price":数字,"quantity":整数股数,"fee":数字手续费(可省略，默认0),' +
    '"tradedAt":"YYYY-MM-DD HH:mm:ss","amount":数字成交金额(可省略)}]}。' +
    '要求：' +
    '1) 时间基于用户提示中的「当前时间」把「今天/昨天/前天/上午/下午」等解析为绝对时间，无法确定具体时分时用 00:00:00；' +
    '2) side 只允许 buy（买入/买/增持）或 sell（卖出/卖/减持/清仓）；' +
    '3) price 是每股成交价，quantity 是股数（不是手数；用户说「1手」按 100 股换算）；' +
    '4) 只输出 JSON，不要任何解释。'
  )
}

/** 用户提示：注入当前时间，让模型能解析相对日期 */
export function naturalTradeUserPrompt(text: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const current = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `当前时间：${current}\n\n用户描述：\n${text.slice(0, 8000)}`
}

/**
 * 把 LLM 返回的 JSON 校验/转换为 ParsedTrade[]。
 * 任何字段不合法的条目直接丢弃（调用方按「解析出 0 条」处理）。
 */
export function sanitizeNaturalTrades(data: unknown): ParsedTrade[] {
  const arr = (data as { trades?: unknown })?.trades
  if (!Array.isArray(arr)) return []
  const out: ParsedTrade[] = []
  for (const raw of arr) {
    const t = raw as Record<string, unknown>
    const symbol = normalizeSymbol(String(t?.symbol ?? '').trim())
    const side = parseSide(String(t?.side ?? '').trim().toLowerCase())
    const price = parseNumber(t?.price)
    const quantity = parseNumber(t?.quantity)
    const tradedAt = parseDate(t?.tradedAt)
    if (!symbol || !side || price == null || quantity == null || tradedAt == null) continue
    if (price <= 0 || quantity <= 0) continue
    const fee = parseNumber(t?.fee) ?? 0
    const amount = parseNumber(t?.amount)
    out.push({
      symbol,
      name: String(t?.name ?? '').trim(),
      side,
      price,
      quantity: Math.round(quantity),
      amount: amount != null && amount > 0 ? amount : null,
      fee: fee >= 0 ? fee : 0,
      tradedAt,
    })
  }
  return out
}

/** 市场规范化（与 shared/stock-market 一致的前缀规则；此处独立实现避免主进程模块循环依赖） */
export function normalizeSymbol(symbol: string): string {
  const m = symbol.match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/i)
  if (!m) return ''
  const code = m[1]
  const market =
    m[2]?.toUpperCase() ??
    (/^(600|601|603|605|688|900)/.test(code)
      ? 'SH'
      : /^(000|001|002|003|300|301|200)/.test(code)
        ? 'SZ'
        : /^(43|83|87|88|92)/.test(code)
          ? 'BJ'
          : '')
  return market ? `${code}.${market}` : ''
}

function parseSide(raw: string): 'buy' | 'sell' | null {
  if (raw === 'buy' || raw === 'sell') return raw
  if (raw === '买入' || raw === '买' || raw === '增持') return 'buy'
  if (raw === '卖出' || raw === '卖' || raw === '减持' || raw === '清仓') return 'sell'
  return null
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[,，\s元股手]/g, '')
    const n = Number(cleaned)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * 解析时间戳，支持：
 * - 'YYYY-MM-DD HH:mm:ss' / 'YYYY-MM-DD' / 'YYYY/M/D H:mm'
 * - 纯时间 'HH:mm' / 'H:mm:ss'（按 today 补日期）
 * - 数字时间戳（秒或毫秒）
 */
export function parseDate(v: unknown, today = new Date()): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return v > 1e12 ? v : v * 1000
  }
  const s = String(v ?? '').trim()
  if (!s) return null

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0)
    ).getTime()
  }
  // 纯时间：按 today 补日期
  m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (m) {
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      Number(m[1]),
      Number(m[2]),
      Number(m[3] ?? 0)
    ).getTime()
  }
  return null
}
