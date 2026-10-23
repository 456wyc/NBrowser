import { describe, it, expect } from 'vitest'
import { parseBrokerStatement } from './broker-import'

const 东方财富 = `成交日期,证券代码,证券名称,买卖标志,成交价格,成交数量,成交金额,手续费
2026-03-12,600519,贵州茅台,证券买入,1680.50,100,168050.00,42.01
2026-03-20,600519,贵州茅台,证券卖出,1750.00,100,175000.00,43.75`

const 同花顺 = `日期	股票代码	名称	方向	成交价	股数	佣金
2026/04/01	000001	平安银行	买入	12.34	1000	5.20
2026/04/08	000001	平安银行	卖出	13.00	1000	5.50`

describe('parseBrokerStatement - 通用表头识别', () => {
  it('东方财富 CSV：识别买卖标志/证券买入卖出', () => {
    const r = parseBrokerStatement(东方财富)
    expect(r.method).toBe('heuristic')
    expect(r.trades).toHaveLength(2)
    expect(r.trades[0]).toMatchObject({
      symbol: '600519',
      name: '贵州茅台',
      side: 'buy',
      price: 1680.5,
      quantity: 100,
      amount: 168050,
      fee: 42.01,
    })
    expect(r.trades[1].side).toBe('sell')
    // 时间默认补到 15:00
    const d = new Date(r.trades[0].tradedAt)
    expect(d.getHours()).toBe(15)
  })

  it('同花顺 TSV：识别方向/买入卖出 + 不同日期格式', () => {
    const r = parseBrokerStatement(同花顺)
    expect(r.trades).toHaveLength(2)
    expect(r.trades[0].side).toBe('buy')
    expect(r.trades[0].symbol).toBe('000001')
    expect(r.trades[0].price).toBe(12.34)
    expect(r.trades[1].side).toBe('sell')
  })

  it('支持英文方向标记 BUY/SELL', () => {
    const csv = `date,code,name,side,price,quantity
2026-05-01,300750,宁德时代,BUY,200.1,200
2026-05-09,300750,宁德时代,SELL,210.0,200`
    const r = parseBrokerStatement(csv)
    expect(r.trades[0].side).toBe('buy')
    expect(r.trades[1].side).toBe('sell')
  })

  it('数字带千分位/货币符号/会计负数可解析', () => {
    const csv = `成交日期,证券代码,买卖标志,成交价格,成交数量,手续费
2026-06-01,600036,证券买入,"1,234.56",500,"¥61.73"`
    const r = parseBrokerStatement(csv)
    expect(r.trades[0].price).toBe(1234.56)
    expect(r.trades[0].fee).toBe(61.73)
  })

  it('无表头或缺少必要列时返回空并提示', () => {
    const r = parseBrokerStatement('a,b,c\n1,2,3')
    expect(r.trades).toHaveLength(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('字段不完整的数据行被跳过', () => {
    const csv = `成交日期,证券代码,买卖标志,成交价格,成交数量,手续费
2026-06-01,600036,证券买入,1234.56,500,61.73
2026-06-02,,证券卖出,,100,2.00`
    const r = parseBrokerStatement(csv)
    expect(r.trades).toHaveLength(1)
    expect(r.warnings.some((w) => w.includes('第 2'))).toBe(true)
  })

  it('未识别的列被记入 unmatched', () => {
    const csv = `成交日期,证券代码,买卖标志,成交价格,成交数量,备注
2026-06-01,600036,证券买入,1234.56,500,自选`
    const r = parseBrokerStatement(csv)
    expect(r.unmatched).toContain('备注')
    expect(r.trades).toHaveLength(1)
  })

  it('代码前缀 SH/SZ 被规范化', () => {
    const csv = `成交日期,证券代码,买卖标志,成交价格,成交数量
2026-06-01,SH600519,证券买入,1680,100`
    const r = parseBrokerStatement(csv)
    expect(r.trades[0].symbol).toBe('600519')
  })
})
