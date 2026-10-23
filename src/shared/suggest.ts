/**
 * 地址栏搜索建议
 * 纯函数，便于单测：根据输入从「书签 + 自选股」召回匹配项，并补上「直接打开 / 搜索」动作。
 */

import { buildSearchUrl, searchEngineName } from './url'

export type SuggestionKind = 'bookmark' | 'watch' | 'url' | 'search'

export interface Suggestion {
  kind: SuggestionKind
  title: string
  subtitle: string
  url: string
}

export interface SuggestSource {
  bookmarks: { title: string; url: string }[]
  watchlist: { symbol: string; name: string }[]
}

function isLikelyUrl(q: string): boolean {
  if (/^https?:\/\//i.test(q)) return true
  // 形如 example.com / www.x.com（含点、无空格、无中文）
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(q) && q.includes('.')
}

function normalizeUrl(q: string): string {
  return /^https?:\/\//i.test(q) ? q : `https://${q}`
}

function stockUrl(symbol: string): string {
  const [code, market = 'sh'] = symbol.split('.')
  return `https://quote.eastmoney.com/${market.toLowerCase()}${code}.html`
}

// 越小越靠前：完全相等 > 前缀匹配 > 包含（包含位置越前越优）
function rank(title: string, q: string): number {
  const t = title.toLowerCase()
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  const idx = t.indexOf(q)
  return idx >= 0 ? 2 + idx / 100 : 99
}

export function buildSuggestions(
  query: string,
  source: SuggestSource,
  limit = 8,
  searchTemplate = 'https://www.baidu.com/s?wd=%s'
): Suggestion[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []

  const matches: Suggestion[] = []

  for (const b of source.bookmarks || []) {
    if (b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) {
      matches.push({ kind: 'bookmark', title: b.title || b.url, subtitle: b.url, url: b.url })
    }
  }

  for (const w of source.watchlist || []) {
    if (w.symbol.toLowerCase().includes(q) || (w.name || '').toLowerCase().includes(q)) {
      matches.push({
        kind: 'watch',
        title: `${w.name}（${w.symbol}）`,
        subtitle: '自选股',
        url: stockUrl(w.symbol),
      })
    }
  }

  matches.sort((a, b) => rank(a.title, q) - rank(b.title, q))

  const actions: Suggestion[] = []
  if (isLikelyUrl(q)) {
    const url = normalizeUrl(query.trim())
    actions.push({ kind: 'url', title: url, subtitle: '直接打开', url })
  } else {
    actions.push({
      kind: 'search',
      title: `搜索 “${query.trim()}”`,
      subtitle: searchEngineName(searchTemplate),
      url: buildSearchUrl(searchTemplate, query.trim()),
    })
  }

  return [...actions, ...matches].slice(0, limit)
}
