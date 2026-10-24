import { describe, it, expect } from 'vitest'
import {
  resolvePath,
  fillTemplate,
  locateQuoteArray,
  parseCustomQuotes,
  type CustomQuoteConfig,
} from './custom-http-provider'

describe('resolvePath', () => {
  const obj = { data: { list: [{ price: 10 }, { price: 20 }], total: 2 } }

  it('点号路径 + 数组索引', () => {
    expect(resolvePath(obj, 'data.total')).toBe(2)
    expect(resolvePath(obj, 'data.list.0.price')).toBe(10)
    expect(resolvePath(obj, 'data.list.1.price')).toBe(20)
  })

  it('空路径 / 不存在 / 中间为 null', () => {
    expect(resolvePath(obj, '')).toBeUndefined()
    expect(resolvePath(obj, 'data.missing')).toBeUndefined()
    expect(resolvePath({ a: null }, 'a.b')).toBeUndefined()
  })
})

describe('fillTemplate', () => {
  it('替换 {codes} 并编码', () => {
    expect(fillTemplate('https://x.com/q?codes={codes}', { codes: '600519.SH,000001.SZ' })).toBe(
      'https://x.com/q?codes=600519.SH%2C000001.SZ'
    )
  })

  it('替换 {code} {period} {limit}', () => {
    expect(
      fillTemplate('https://x.com/k?code={code}&period={period}&limit={limit}', {
        code: '600519.SH',
        period: 'day',
        limit: '250',
      })
    ).toBe('https://x.com/k?code=600519.SH&period=day&limit=250')
  })

  it('未提供的占位符替换为空串', () => {
    expect(fillTemplate('https://x.com/{code}', {})).toBe('https://x.com/')
  })
})

describe('locateQuoteArray', () => {
  it('按配置路径取数组', () => {
    expect(locateQuoteArray({ data: { list: [{ a: 1 }] } }, 'data.list')).toEqual([{ a: 1 }])
  })

  it('路径错误返回空（不静默拿错数据）', () => {
    expect(locateQuoteArray({ data: { list: [{ a: 1 }] } }, 'data.other')).toEqual([])
  })

  it('无路径时自动探测第一个对象数组', () => {
    const json = { code: 0, msg: 'ok', result: { items: [{ x: 1 }, { x: 2 }] } }
    expect(locateQuoteArray(json)).toEqual([{ x: 1 }, { x: 2 }])
  })

  it('纯标量响应探测不到数组', () => {
    expect(locateQuoteArray({ code: 0, msg: 'ok' })).toEqual([])
  })
})

describe('parseCustomQuotes', () => {
  const cfg: CustomQuoteConfig = {
    quoteUrl: 'https://x.com/{codes}',
    fieldMap: {
      code: 'code',
      name: 'name',
      price: 'last',
      changePercent: 'pct_chg',
      open: 'open',
      prevClose: 'pre_close',
      high: 'high',
      low: 'low',
      volume: 'vol',
      amount: 'amt',
    },
  }

  it('按字段路径映射', () => {
    const rows = [
      {
        code: '600519',
        name: '贵州茅台',
        last: '1515.00',
        pct_chg: '4.27',
        open: '1460',
        pre_close: '1453',
        high: '1520',
        low: '1455',
        vol: '23456',
        amt: '352000000',
      },
    ]
    const out = parseCustomQuotes(rows, cfg, ['600519.SH'], 1000)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      symbol: '600519.SH',
      name: '贵州茅台',
      price: 1515,
      changePercent: 4.27,
      open: 1460,
      prevClose: 1453,
      high: 1520,
      low: 1455,
      volume: 23456,
      amount: 352000000,
      timestamp: 1000,
    })
  })

  it('裸 6 位代码补市场后缀', () => {
    const out = parseCustomQuotes([{ code: '300750', last: 100 }], cfg, [], 0)
    expect(out[0].symbol).toBe('300750.SZ')
  })

  it('错误后缀被纠正', () => {
    const out = parseCustomQuotes([{ code: '301235.SH', last: 100 }], cfg, [], 0)
    expect(out[0].symbol).toBe('301235.SZ')
  })

  it('响应无 code 字段时按请求顺序回填', () => {
    const rows = [{ last: 1515 }, { last: 11.5 }]
    const out = parseCustomQuotes(rows, cfg, ['600519.SH', '000001.SZ'], 0)
    expect(out.map((q) => q.symbol)).toEqual(['600519.SH', '000001.SZ'])
  })

  it('字段缺失时退化为 0（不产生 NaN）', () => {
    const out = parseCustomQuotes([{ code: '600519', last: 100 }], cfg, [], 0)
    expect(out[0].price).toBe(100)
    expect(out[0].volume).toBe(0)
    expect(out[0].changePercent).toBe(0)
    expect(Number.isNaN(out[0].price)).toBe(false)
  })

  it('name 缺失时用代码兜底', () => {
    const out = parseCustomQuotes([{ code: '600519', last: 100 }], cfg, [], 0)
    expect(out[0].name).toBe('600519.SH')
  })

  it('数字型字段值（非字符串）也兼容', () => {
    const out = parseCustomQuotes([{ code: '600519', last: 1515, pct_chg: 4.27 }], cfg, [], 0)
    expect(out[0].price).toBe(1515)
    expect(out[0].changePercent).toBe(4.27)
  })
})
