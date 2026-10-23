/**
 * 行情数据结构
 */
export interface Quote {
  symbol: string // 股票代码，如 600519.SH
  name: string // 股票名称
  price: number // 现价
  changePercent: number // 涨跌幅（%，正数为涨，负数为跌）
  changeAmount: number // 涨跌额
  open: number // 开盘价
  prevClose: number // 昨收
  high: number // 最高
  low: number // 最低
  volume: number // 成交量（手）
  amount: number // 成交额（元）
  timestamp: number // 数据时间戳（毫秒）
}

/**
 * 股票搜索结果
 */
export interface SearchResult {
  symbol: string
  name: string
  market: string // 市场：SH / SZ / BJ
}

/**
 * K 线（历史行情）数据
 */
export interface KLine {
  ts: number // 该周期的时间戳（毫秒，日线为当日 0 点）
  open: number
  close: number
  high: number
  low: number
  volume: number
}

/** K 线周期：日 / 周 / 60 分 / 15 分 / 5 分 */
export type KLinePeriod = 'day' | 'week' | '60m' | '15m' | '5m'

/**
 * 行情 Provider 接口
 * UI 层只依赖此接口，不直接调用具体行情接口。
 * 新增数据源只需新增一个实现文件。
 */
export interface QuoteProvider {
  /**
   * Provider 名称（用于日志和调试）
   */
  readonly name: string

  /**
   * 批量获取行情
   * @param codes 股票代码数组，格式如 ['600519.SH', '000001.SZ']
   */
  getQuotes(codes: string[]): Promise<Quote[]>

  /**
   * 搜索股票（按代码或名称）
   * @param keyword 搜索关键词
   */
  searchSymbol(keyword: string): Promise<SearchResult[]>

  /**
   * 获取历史 K 线（前复权），按时间升序
   * @param code 股票代码，如 '600519.SH'
   * @param period 周期，默认日线
   * @param limit 取最近 N 根，默认 250
   */
  getKLine(code: string, period?: KLinePeriod, limit?: number): Promise<KLine[]>
}
