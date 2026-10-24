import { describe, it, expect } from 'vitest'
import {
  splitSearchTerms,
  mergeBatchCandidates,
  defaultBatchSelection,
  toFullSymbol,
  MAX_BATCH_TERMS,
} from './watchlist-batch'

describe('toFullSymbol', () => {
  it('裸 6 位代码补后缀', () => {
    expect(toFullSymbol('600519')).toBe('600519.SH')
    expect(toFullSymbol('300750')).toBe('300750.SZ')
    expect(toFullSymbol('430047')).toBe('430047.BJ')
  })

  it('纠正错误后缀', () => {
    expect(toFullSymbol('301235.SH')).toBe('301235.SZ')
  })

  it('非 6 位代码返回空', () => {
    expect(toFullSymbol('茅台')).toBe('')
    expect(toFullSymbol('')).toBe('')
    expect(toFullSymbol('600519.SHH')).toBe('')
  })
})

describe('splitSearchTerms', () => {
  it('空格分隔', () => {
    expect(splitSearchTerms('茅台 五粮液 泸州老窖')).toEqual(['茅台', '五粮液', '泸州老窖'])
  })

  it('中英文逗号/顿号/分号/换行均可', () => {
    expect(splitSearchTerms('茅台，五粮液、泸州老窖;宁德时代\n比亚迪')).toEqual([
      '茅台',
      '五粮液',
      '泸州老窖',
      '宁德时代',
      '比亚迪',
    ])
  })

  it('去重（大小写不敏感）且跳过空段', () => {
    expect(splitSearchTerms('茅台 茅台 MAOTAI  ，  ，五粮液')).toEqual(['茅台', 'MAOTAI', '五粮液'])
  })

  it('超过上限截断到 10 个', () => {
    const input = Array.from({ length: 15 }, (_, i) => `股票${i}`).join(' ')
    expect(splitSearchTerms(input)).toHaveLength(MAX_BATCH_TERMS)
  })

  it('空输入返回空数组', () => {
    expect(splitSearchTerms('')).toEqual([])
    expect(splitSearchTerms('   ， 、 ')).toEqual([])
  })
})

describe('mergeBatchCandidates', () => {
  it('多关键词结果按代码去重、聚合 matchedTerms', () => {
    const out = mergeBatchCandidates(
      [
        { term: '茅台', results: [{ symbol: '600519.SH', name: '贵州茅台' }] },
        { term: '白酒', results: [{ symbol: '600519.SH', name: '贵州茅台' }, { symbol: '000858.SZ', name: '五粮液' }] },
      ],
      []
    )
    expect(out).toHaveLength(2)
    expect(out[0].symbol).toBe('600519.SH')
    expect(out[0].matchedTerms).toEqual(['茅台', '白酒'])
    expect(out[1].symbol).toBe('000858.SZ')
  })

  it('已在自选的标记 alreadyIn', () => {
    const out = mergeBatchCandidates(
      [{ term: '茅台', results: [{ symbol: '600519.SH', name: '贵州茅台' }] }],
      ['600519.sh'] // 大小写/格式不一致也应识别
    )
    expect(out[0].alreadyIn).toBe(true)
  })

  it('代码规范化（无后缀补全、错误后缀纠正）', () => {
    const out = mergeBatchCandidates(
      [
        {
          term: 't',
          results: [
            { symbol: '600519', name: '贵州茅台' },
            { symbol: '301235.SH', name: '某创业板' }, // 错误后缀应纠正为 .SZ
          ],
        },
      ],
      []
    )
    expect(out[0].symbol).toBe('600519.SH')
    expect(out[1].symbol).toBe('301235.SZ')
  })

  it('保持关键词首次出现顺序', () => {
    const out = mergeBatchCandidates(
      [
        { term: 'a', results: [{ symbol: '000001.SZ', name: '平安银行' }] },
        { term: 'b', results: [{ symbol: '600519.SH', name: '贵州茅台' }] },
      ],
      []
    )
    expect(out.map((c) => c.symbol)).toEqual(['000001.SZ', '600519.SH'])
  })

  it('名称为空时用代码兜底', () => {
    const out = mergeBatchCandidates([{ term: 'x', results: [{ symbol: '600519', name: '' }] }], [])
    expect(out[0].name).toBe('600519.SH')
  })

  it('空结果安全', () => {
    expect(mergeBatchCandidates([], [])).toEqual([])
    expect(mergeBatchCandidates([{ term: 'x', results: [] }], ['600519.SH'])).toEqual([])
  })
})

describe('defaultBatchSelection', () => {
  it('默认勾选未在自选的', () => {
    const candidates = mergeBatchCandidates(
      [
        {
          term: 't',
          results: [
            { symbol: '600519.SH', name: '贵州茅台' },
            { symbol: '000858.SZ', name: '五粮液' },
          ],
        },
      ],
      ['600519.SH']
    )
    expect(defaultBatchSelection(candidates)).toEqual(new Set([1]))
  })
})
