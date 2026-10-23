/**
 * 各股票网站的 URL 股票代码提取规则
 * 每个规则：匹配 URL 模式 -> 提取代码的正则捕获组 -> 拼接市场后缀
 */

import { guessMarket } from './market'

export interface UrlPattern {
  name: string // 站点名称
  // 匹配函数：传入 URL（完整 URL 字符串），返回股票代码（不含市场后缀），识别不到返回 null
  match: (url: string) => string | null
}

function withMarket(code: string | null): string | null {
  if (!code) return null
  const market = guessMarket(code)
  return market ? `${code}.${market}` : null
}

export const urlPatterns: UrlPattern[] = [
  // ---------- 东方财富 eastmoney.com ----------
  {
    name: '东方财富',
    match: (url: string): string | null => {
      // 行情页：https://quote.eastmoney.com/sh600519.html
      // 行情页：https://quote.eastmoney.com/sz000001.html
      // 行情页：https://quote.eastmoney.com/bj430047.html
      let m = url.match(/quote\.eastmoney\.com\/(sh|sz|bj)(\d{6})\.html/i)
      if (m) return `${m[2]}.${m[1].toUpperCase()}`

      // 股吧：https://guba.eastmoney.com/list,600519.html
      // 股吧：https://guba.eastmoney.com/list,000001.html
      m = url.match(/guba\.eastmoney\.com\/list,(\d{6})\.html/i)
      if (m) return withMarket(m[1])

      // 个股公告：https://data.eastmoney.com/notices/stock/600519.html
      m = url.match(/data\.eastmoney\.com\/notices\/stock\/(\d{6})\.html/i)
      if (m) return withMarket(m[1])

      // 个股财务：https://data.eastmoney.com/bbsj/600519.html
      m = url.match(/data\.eastmoney\.com\/bbsj\/(\d{6})\.html/i)
      if (m) return withMarket(m[1])

      // 个股资金流：https://data.eastmoney.com/zjlx/600519.html
      m = url.match(/data\.eastmoney\.com\/zjlx\/(\d{6})\.html/i)
      if (m) return withMarket(m[1])

      return null
    },
  },

  // ---------- 同花顺 10jqka.com.cn ----------
  {
    name: '同花顺',
    match: (url: string): string | null => {
      // 行情页：https://stockpage.10jqka.com.cn/600519/
      // 行情页：https://stockpage.10jqka.com.cn/000001/
      let m = url.match(/stockpage\.10jqka\.com\.cn\/(\d{6})\/?/i)
      if (m) return withMarket(m[1])

      // 个股：https://q.10jqka.com.cn/600519/
      m = url.match(/q\.10jqka\.com\.cn\/(\d{6})\/?/i)
      if (m) return withMarket(m[1])

      // 问财个股：https://basic.10jqka.com.cn/600519/
      m = url.match(/basic\.10jqka\.com\.cn\/(\d{6})\/?/i)
      if (m) return withMarket(m[1])

      // 公告：https://stockpage.10jqka.com.cn/600519/notice/
      m = url.match(/stockpage\.10jqka\.com\.cn\/(\d{6})\/notice/i)
      if (m) return withMarket(m[1])

      return null
    },
  },

  // ---------- 雪球 xueqiu.com ----------
  {
    name: '雪球',
    match: (url: string): string | null => {
      // 个股页：https://xueqiu.com/S/SH600519
      // 个股页：https://xueqiu.com/S/SZ000001
      let m = url.match(/xueqiu\.com\/S\/(SH|SZ|BJ)(\d{6})/i)
      if (m) return `${m[2]}.${m[1].toUpperCase()}`

      // 旧格式：https://xueqiu.com/S/600519
      m = url.match(/xueqiu\.com\/S\/(\d{6})(?:[?\/]|$)/i)
      if (m) return withMarket(m[1])

      // 讨论页面带代码参数的情况较少，主要靠上面两种

      return null
    },
  },

  // ---------- 巨潮资讯 cninfo.com.cn ----------
  {
    name: '巨潮资讯',
    match: (url: string): string | null => {
      // 公告详情：http://www.cninfo.com.cn/new/disclosure/detail?stockCode=600519&...
      let m = url.match(/cninfo\.com\.cn\/.*stockCode=(\d{6})/i)
      if (m) return withMarket(m[1])

      // 个股页面：http://www.cninfo.com.cn/new/information?code=600519
      m = url.match(/cninfo\.com\.cn\/.*code=(\d{6})/i)
      if (m) return withMarket(m[1])

      return null
    },
  },
]
