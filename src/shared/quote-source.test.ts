import { describe, it, expect } from 'vitest'
import { quoteSourceLabel } from './quote-source'

describe('quoteSourceLabel', () => {
  it('内置数据源用中文名', () => {
    expect(quoteSourceLabel('eastmoney')).toBe('东方财富')
    expect(quoteSourceLabel('tencent')).toBe('腾讯财经')
    expect(quoteSourceLabel('custom')).toBe('自定义 API')
  })

  it('未知数据源原样返回，不会显示成空白', () => {
    expect(quoteSourceLabel('sina')).toBe('sina')
    expect(quoteSourceLabel('')).toBe('未知数据源')
    expect(quoteSourceLabel(undefined)).toBe('未知数据源')
  })
})
