import { describe, it, expect } from 'vitest'
import {
  parseTencentQuoteText,
  parseTencentTime,
  toTencentCode,
  fromTencentCode,
  extractKlineRows,
  parseKlineDate,
} from './tencent-provider'

describe('代码转换', () => {
  it('内部 → 腾讯', () => {
    expect(toTencentCode('600519.SH')).toBe('sh600519')
    expect(toTencentCode('000001.SZ')).toBe('sz000001')
    expect(toTencentCode('430047.BJ')).toBe('bj430047')
    expect(toTencentCode('600519')).toBeNull()
  })

  it('腾讯 → 内部（前缀推断纠正错误市场标记）', () => {
    expect(fromTencentCode('sh', '600519')).toBe('600519.SH')
    expect(fromTencentCode('sz', '000001')).toBe('000001.SZ')
    // 腾讯偶尔把北交所标成 sz，用代码前缀纠正
    expect(fromTencentCode('sz', '430047')).toBe('430047.BJ')
    expect(fromTencentCode('xx', '600519')).toBeNull()
  })
})

describe('parseTencentQuoteText', () => {
  it('解析一条完整行情', () => {
    const f = new Array(60).fill('')
    f[1] = '贵州茅台'
    f[2] = '600519'
    f[3] = '1515.00' // 现价
    f[4] = '1453.00' // 昨收
    f[5] = '1460.00' // 今开
    f[6] = '23456' // 成交量（手）
    f[30] = '20261024103000'
    f[31] = '62.00' // 涨跌额
    f[32] = '4.27' // 涨跌幅
    f[33] = '1520.00' // 最高
    f[34] = '1455.00' // 最低
    f[37] = '3520' // 成交额（万）
    const text = `v_sh600519="${f.join('~')}";`

    const out = parseTencentQuoteText(text)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      symbol: '600519.SH',
      name: '贵州茅台',
      price: 1515,
      changePercent: 4.27,
      changeAmount: 62,
      open: 1460,
      prevClose: 1453,
      high: 1520,
      low: 1455,
      volume: 23456,
      amount: 35200000, // 万元 → 元
    })
    expect(out[0].timestamp).toBe(new Date(2026, 9, 24, 10, 30, 0).getTime())
  })

  it('多条批量解析，跳过停牌/无数据行', () => {
    const f = new Array(60).fill('')
    f[1] = '平安银行'
    f[3] = '11.50'
    f[30] = '20261024103000'
    const stopped = new Array(60).fill('')
    stopped[1] = '某停牌股'
    stopped[2] = '600001'
    const text = `v_sz000001="${f.join('~')}";v_sh600001="${stopped.join('~')}";`

    const out = parseTencentQuoteText(text)
    expect(out).toHaveLength(1)
    expect(out[0].symbol).toBe('000001.SZ')
  })

  it('空文本 / 格式不符返回空数组', () => {
    expect(parseTencentQuoteText('')).toEqual([])
    expect(parseTencentQuoteText('garbage')).toEqual([])
  })
})

describe('parseTencentTime', () => {
  it('14 位时间戳', () => {
    expect(parseTencentTime('20261024103000')).toBe(new Date(2026, 9, 24, 10, 30, 0).getTime())
  })

  it('非法输入返回 0', () => {
    expect(parseTencentTime('')).toBe(0)
    expect(parseTencentTime(undefined)).toBe(0)
    expect(parseTencentTime('2026-10-24')).toBe(0)
    expect(parseTencentTime('202610241030')).toBe(0) // 12 位不算
  })
})

describe('extractKlineRows', () => {
  it('取 qfqday 键（前复权日线）', () => {
    const data = {
      data: {
        sh600519: {
          qfqday: [
            ['2026-10-22', '1500.00', '1510.00', '1520.00', '1490.00', '12345.00'],
            ['2026-10-23', '1510.00', '1505.00', '1515.00', '1495.00', '11000.00'],
          ],
        },
      },
    }
    const rows = extractKlineRows(data, 'sh600519', 'day')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ open: 1500, close: 1510, high: 1520, low: 1490, volume: 12345 })
    // 升序
    expect(rows[0].ts).toBeLessThan(rows[1].ts)
  })

  it('回退裸 day 键（无复权前缀）', () => {
    const data = { data: { sh600519: { day: [['2026-10-23', '1', '2', '3', '0.5', '100']] } } }
    expect(extractKlineRows(data, 'sh600519', 'day')).toHaveLength(1)
  })

  it('缺代码 / 非数组返回空', () => {
    expect(extractKlineRows({ data: {} }, 'sh600519', 'day')).toEqual([])
    expect(extractKlineRows({ data: { sh600519: { day: 'x' } } }, 'sh600519', 'day')).toEqual([])
  })
})

describe('parseKlineDate', () => {
  it('日期 / 日期时间', () => {
    expect(parseKlineDate('2026-10-23')).toBe(new Date(2026, 9, 23).getTime())
    expect(parseKlineDate('2026-10-23 14:35')).toBe(new Date(2026, 9, 23, 14, 35).getTime())
    expect(parseKlineDate('2026/10/23')).toBe(new Date(2026, 9, 23).getTime())
  })

  it('非法返回 0', () => {
    expect(parseKlineDate('')).toBe(0)
    expect(parseKlineDate('abc')).toBe(0)
  })
})
