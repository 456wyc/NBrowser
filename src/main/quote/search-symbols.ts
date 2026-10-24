import { net } from 'electron'
import type { SearchResult } from './provider'

/**
 * 股票搜索（东财 suggest）
 *
 * 与行情数据源解耦：无论当前行情 Provider 是东财、腾讯还是自定义 API，
 * 搜索都走这里——搜索关注的是「代码↔名称」的静态映射，与实时行情源无关，
 * 且腾讯/自定义源的搜索协议各自为政，统一实现可避免三套脆弱的解析。
 */
export async function searchSymbolsEastmoney(keyword: string): Promise<SearchResult[]> {
  if (!keyword.trim()) return []

  const url =
    'https://searchapi.eastmoney.com/api/suggest/get' +
    `?input=${encodeURIComponent(keyword)}` +
    '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10'

  const response = await net.fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.eastmoney.com/',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const data: EastmoneySearchResponse = await response.json()
  if (!data?.QuotationCodeTable?.Data) return []

  return data.QuotationCodeTable.Data.map((item) => ({
    symbol: toStandardCode(item.Code, item.MktNum),
    name: item.Name,
    market: marketNumToMarket(item.MktNum),
  })).filter((item) => item.symbol) as SearchResult[]
}

function toStandardCode(code: string, mktNum: number): string {
  return `${code}.${marketNumToMarket(mktNum)}`
}

function marketNumToMarket(mktNum: number): string {
  // 东方财富市场代码：沪A=1, 深A=0, 北交所=3
  switch (mktNum) {
    case 1:
      return 'SH'
    case 0:
    case 2:
      return 'SZ'
    case 3:
      return 'BJ'
    default:
      return 'SH'
  }
}

interface EastmoneySearchResponse {
  QuotationCodeTable?: {
    Data: Array<{
      Code: string
      Name: string
      MktNum: number
    }>
  }
}
