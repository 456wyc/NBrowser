/**
 * A 股代码 -> 市场归属（单一来源，主进程与渲染进程共用）
 *
 * 返回 '' 表示无法判断。
 */
export function guessMarket(code: string): string {
  // 沪市主板 600/601/603/605，科创板 688/689，B 股 900
  if (/^(600|601|603|605|688|689|900)/.test(code)) return 'SH'
  // 深市主板 000/001/002/003，创业板 300/301，B 股 200
  if (/^(000|001|002|003|300|301|200)/.test(code)) return 'SZ'
  // 北交所 43/83/87/88/92 开头
  if (/^(43|83|87|88|92)/.test(code)) return 'BJ'
  return ''
}

/**
 * 是否为 A 股常见代码前缀
 */
export function isStockCodePrefix(code: string): boolean {
  return guessMarket(code) !== ''
}

/**
 * 按 A 股代码前缀规范化市场后缀。
 * 可修复存储或外部来源带来的错误后缀（如 301235.SH -> 301235.SZ）。
 */
export function normalizeSymbol(symbol: string): string {
  const parts = symbol.split('.')
  if (parts.length !== 2) return symbol
  const [code, _market] = parts
  const market = guessMarket(code)
  return market ? `${code}.${market}` : symbol
}

/** 取纯 6 位代码（去掉市场后缀） */
export function stockCode(symbol: string): string {
  return normalizeSymbol(symbol).split('.')[0]
}

/** 东方财富个股行情页 URL */
export function eastmoneyQuoteUrl(symbol: string): string {
  const norm = normalizeSymbol(symbol)
  const code = norm.split('.')[0]
  const market = norm.split('.')[1]?.toLowerCase() || 'sh'
  return `https://quote.eastmoney.com/${market}${code}.html`
}

/** 东方财富个股公告页 URL */
export function eastmoneyAnnouncementsUrl(symbol: string): string {
  return `https://data.eastmoney.com/notices/stock/${stockCode(symbol)}.html`
}
