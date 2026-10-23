import { describe, it, expect } from 'vitest'
import { extractStockFromUrl, extractStockFromText } from './index'

describe('extractStockFromUrl - 东方财富', () => {
  it('行情页 sh 前缀', () => {
    expect(extractStockFromUrl('https://quote.eastmoney.com/sh600519.html')).toBe('600519.SH')
  })

  it('行情页 sz 前缀', () => {
    expect(extractStockFromUrl('https://quote.eastmoney.com/sz000001.html')).toBe('000001.SZ')
  })

  it('行情页 bj 前缀（北交所）', () => {
    expect(extractStockFromUrl('https://quote.eastmoney.com/bj430047.html')).toBe('430047.BJ')
  })

  it('股吧列表页', () => {
    expect(extractStockFromUrl('https://guba.eastmoney.com/list,600519.html')).toBe('600519.SH')
  })

  it('公告页', () => {
    expect(extractStockFromUrl('https://data.eastmoney.com/notices/stock/000858.html')).toBe('000858.SZ')
  })

  it('非股票页面返回 null', () => {
    expect(extractStockFromUrl('https://www.eastmoney.com/')).toBeNull()
    expect(extractStockFromUrl('https://quote.eastmoney.com/center/gridlist.html')).toBeNull()
  })
})

describe('extractStockFromUrl - 同花顺', () => {
  it('行情页 60 开头（沪市）', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/600519/')).toBe('600519.SH')
  })

  it('行情页 00 开头（深市）', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/000001/')).toBe('000001.SZ')
  })

  it('个股 q 页面', () => {
    expect(extractStockFromUrl('https://q.10jqka.com.cn/300750/')).toBe('300750.SZ')
  })

  it('basic 基本面页面', () => {
    expect(extractStockFromUrl('https://basic.10jqka.com.cn/601318/')).toBe('601318.SH')
  })

  it('公告子页面', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/002594/notice/')).toBe('002594.SZ')
  })

  it('非股票页面返回 null', () => {
    expect(extractStockFromUrl('https://www.10jqka.com.cn/')).toBeNull()
  })
})

describe('extractStockFromUrl - 雪球', () => {
  it('个股页 SH 前缀', () => {
    expect(extractStockFromUrl('https://xueqiu.com/S/SH600519')).toBe('600519.SH')
  })

  it('个股页 SZ 前缀', () => {
    expect(extractStockFromUrl('https://xueqiu.com/S/SZ000001')).toBe('000001.SZ')
  })

  it('个股页 BJ 前缀', () => {
    expect(extractStockFromUrl('https://xueqiu.com/S/BJ430047')).toBe('430047.BJ')
  })

  it('旧格式纯代码（不带市场前缀）', () => {
    expect(extractStockFromUrl('https://xueqiu.com/S/600519')).toBe('600519.SH')
  })

  it('带查询参数的个股页', () => {
    expect(extractStockFromUrl('https://xueqiu.com/S/SH601899?x=1')).toBe('601899.SH')
  })

  it('非股票页面返回 null', () => {
    expect(extractStockFromUrl('https://xueqiu.com/')).toBeNull()
    expect(extractStockFromUrl('https://xueqiu.com/today')).toBeNull()
  })
})

describe('extractStockFromUrl - 巨潮资讯', () => {
  it('公告详情页带 stockCode 参数', () => {
    expect(
      extractStockFromUrl(
        'http://www.cninfo.com.cn/new/disclosure/detail?stockCode=600519&announcementId=123'
      )
    ).toBe('600519.SH')
  })

  it('深市股票', () => {
    expect(
      extractStockFromUrl('http://www.cninfo.com.cn/new/information?code=000001')
    ).toBe('000001.SZ')
  })
})

describe('extractStockFromUrl - 沪市各前缀（回归）', () => {
  it('601 开头是沪市主板', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/601398/')).toBe('601398.SH')
  })

  it('603 开头是沪市主板', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/603288/')).toBe('603288.SH')
  })

  it('605 开头是沪市主板', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/605358/')).toBe('605358.SH')
  })

  it('688 开头是科创板（沪市）', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/688111/')).toBe('688111.SH')
  })

  it('300 开头是深市创业板（不是北交所）', () => {
    expect(extractStockFromUrl('https://stockpage.10jqka.com.cn/300750/')).toBe('300750.SZ')
  })
})

describe('extractStockFromText - 文本提取', () => {
  it('从标题提取股票代码（括号形式）', () => {
    const result = extractStockFromText('贵州茅台(600519) 股价创新高')
    expect(result).toContain('600519.SH')
  })

  it('从标题提取（代码在前）', () => {
    const result = extractStockFromText('600036 招商银行 三季报点评')
    expect(result).toContain('600036.SH')
  })

  it('从正文中提取多个股票', () => {
    const result = extractStockFromText(
      '今日关注贵州茅台(600519)、五粮液000858和泸州老窖000568的表现',
      ''
    )
    expect(result).toContain('600519.SH')
    expect(result).toContain('000858.SZ')
    expect(result).toContain('000568.SZ')
  })

  it('深市创业板 300 开头', () => {
    const result = extractStockFromText('宁德时代 300750 业绩预告')
    expect(result).toContain('300750.SZ')
  })

  it('北交所股票', () => {
    const result = extractStockFromText('贝特瑞(835185) 北交所龙头')
    expect(result).toContain('835185.BJ')
  })

  it('排除明显不是股票代码的 6 位数', () => {
    const result = extractStockFromText('2024年10月15日的销售额是123456元')
    // 202410 不是股票代码，123456 也不是
    expect(result.length).toBe(0)
  })

  it('空字符串返回空数组', () => {
    expect(extractStockFromText('', '')).toEqual([])
  })

  it('上下文有"沪市"标记时正确归类', () => {
    const result = extractStockFromText('沪市 600000 浦发银行')
    expect(result).toContain('600000.SH')
  })

  it('上下文有"深交所"标记时正确归类', () => {
    const result = extractStockFromText('深交所 000002 万科A')
    expect(result).toContain('000002.SZ')
  })

  it('深市主板 000 开头不能被误判为非股票代码（回归）', () => {
    const result = extractStockFromText('平安银行(000001) 今日大涨')
    expect(result).toContain('000001.SZ')
  })

  it('300 开头是深市创业板而非北交所（回归）', () => {
    const result = extractStockFromText('宁德时代 300750 业绩预告')
    expect(result).toContain('300750.SZ')
    expect(result).not.toContain('300750.BJ')
  })
})
