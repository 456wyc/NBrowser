/**
 * 自选股批量添加：把「茅台 五粮液 泸州老窖」这类多关键词输入
 * 拆成多个检索词，合并去重各词的搜索结果，产出带勾选状态的候选列表。
 *
 * 纯函数、无 IPC——UI 层负责并行调用 watchlist:search 后交给 mergeBatchCandidates 汇总，
 * 因此可以不配置 LLM 也使用（检索走东方财富 suggest 接口）。
 */

import { normalizeSymbol, guessMarket } from './stock-market'

/** 单次检索的最大关键词数（防止一次粘贴几十个词把 suggest 接口打爆） */
export const MAX_BATCH_TERMS = 10

/**
 * 完整规范化：裸 6 位代码补后缀（600519 → 600519.SH）、
 * 带后缀的纠正错误后缀（301235.SH → 301235.SZ）、
 * 非 6 位代码返回空（调用方跳过）。
 * 注意：shared 的 normalizeSymbol 只做后缀纠正、不补后缀，这里补上。
 */
export function toFullSymbol(symbol: string): string {
  const s = (symbol || '').trim()
  if (/^\d{6}$/.test(s)) {
    const market = guessMarket(s)
    return market ? `${s}.${market}` : ''
  }
  if (/^\d{6}\.(SH|SZ|BJ)$/i.test(s)) return normalizeSymbol(s)
  return ''
}

/** 拆分检索词：空格 / 中英文逗号 / 顿号 / 分号 / 换行均视为分隔符 */
export function splitSearchTerms(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of (input || '').split(/[\s,，、;；]+/)) {
    const term = raw.trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= MAX_BATCH_TERMS) break
  }
  return out
}

export interface BatchCandidate {
  symbol: string
  name: string
  /** 命中该股票的关键词（多个词搜到同一只时会聚合） */
  matchedTerms: string[]
  /** 是否已在自选股中（在列表中默认不勾选且禁用） */
  alreadyIn: boolean
}

/**
 * 合并多个关键词的搜索结果：
 * - 按规范化代码去重，matchedTerms 聚合；
 * - 已在自选股的标记 alreadyIn；
 * - 保持「首次出现顺序」，即按关键词顺序排列，符合用户输入直觉。
 */
export function mergeBatchCandidates(
  termResults: Array<{ term: string; results: Array<{ symbol: string; name: string }> }>,
  existingSymbols: string[]
): BatchCandidate[] {
  const existing = new Set(
    existingSymbols.map((s) => toFullSymbol(s).toLowerCase()).filter(Boolean)
  )
  const bySymbol = new Map<string, BatchCandidate>()
  for (const { term, results } of termResults) {
    for (const r of results) {
      const symbol = toFullSymbol(r.symbol)
      if (!symbol) continue
      const key = symbol.toLowerCase()
      const found = bySymbol.get(key)
      if (found) {
        if (!found.matchedTerms.includes(term)) found.matchedTerms.push(term)
        // 后出现的同名结果可能是更完整的名称，取非空者
        if (!found.name && r.name) found.name = r.name
        continue
      }
      bySymbol.set(key, {
        symbol,
        name: r.name || symbol,
        matchedTerms: [term],
        alreadyIn: existing.has(key),
      })
    }
  }
  return [...bySymbol.values()]
}

/** 默认勾选：未在自选股中的候选 */
export function defaultBatchSelection(candidates: BatchCandidate[]): Set<number> {
  const sel = new Set<number>()
  candidates.forEach((c, i) => {
    if (!c.alreadyIn) sel.add(i)
  })
  return sel
}
