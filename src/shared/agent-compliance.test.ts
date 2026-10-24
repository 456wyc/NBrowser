import { describe, it, expect } from 'vitest'
import { appendDisclaimerIfNeeded, containsAdvice } from './agent-compliance'

describe('containsAdvice', () => {
  it('识别「建议买入」类句式', () => {
    expect(containsAdvice('综合来看，建议买入这只股票')).toBe(true)
    expect(containsAdvice('如果被套可以考虑加仓')).toBe(true)
    expect(containsAdvice('现在可以清仓离场')).toBe(true)
  })

  it('识别目标价与预测价位', () => {
    expect(containsAdvice('券商给出的目标价是 1800 元')).toBe(true)
    expect(containsAdvice('预计股价将涨到 200 元')).toBe(true)
  })

  it('事实陈述不误判', () => {
    expect(containsAdvice('公司公告 2025 年净利润同比增长 12%')).toBe(false)
    expect(containsAdvice('当前市盈率 28 倍，高于行业平均')).toBe(false)
    expect(containsAdvice('利好：新产品上线；利空：原材料涨价')).toBe(false)
    expect(containsAdvice('')).toBe(false)
  })
})

describe('appendDisclaimerIfNeeded', () => {
  it('含建议句式时追加免责声明', () => {
    const out = appendDisclaimerIfNeeded('建议买入')
    expect(out).toContain('建议买入')
    expect(out).toContain('不构成投资建议')
  })

  it('不含建议句式时原文返回（不打扰正常回答）', () => {
    const text = '公司三季度营收 100 亿元，同比增长 8%。'
    expect(appendDisclaimerIfNeeded(text)).toBe(text)
  })

  it('空串安全', () => {
    expect(appendDisclaimerIfNeeded('')).toBe('')
  })
})
