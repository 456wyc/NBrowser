import { describe, it, expect } from 'vitest'
import { buildSuggestions, type SuggestSource } from './suggest'

const source: SuggestSource = {
  bookmarks: [
    { title: '东方财富', url: 'https://www.eastmoney.com/' },
    { title: '同花顺', url: 'https://www.10jqka.com.cn/' },
  ],
  watchlist: [
    { symbol: '600519.SH', name: '贵州茅台' },
    { symbol: '000001.SZ', name: '平安银行' },
  ],
}

describe('buildSuggestions', () => {
  it('空输入返回空', () => {
    expect(buildSuggestions('', source)).toEqual([])
    expect(buildSuggestions('   ', source)).toEqual([])
  })

  it('按书签标题召回', () => {
    const r = buildSuggestions('东方', source)
    expect(r.some((s) => s.kind === 'bookmark' && s.url.includes('eastmoney'))).toBe(true)
  })

  it('按书签 URL 召回', () => {
    const r = buildSuggestions('10jqka', source)
    expect(r.some((s) => s.kind === 'bookmark' && s.url.includes('10jqka'))).toBe(true)
  })

  it('按自选股代码与名称召回，跳转到东方财富行情页', () => {
    const r = buildSuggestions('600519', source)
    const m = r.find((s) => s.kind === 'watch')
    expect(m?.url).toBe('https://quote.eastmoney.com/sh600519.html')
    expect(m?.title).toContain('贵州茅台')
  })

  it('名称中文召回', () => {
    const r = buildSuggestions('平安', source)
    expect(r.some((s) => s.kind === 'watch' && s.url.includes('sz000001'))).toBe(true)
  })

  it('像网址的输入给出「直接打开」动作', () => {
    const r = buildSuggestions('eastmoney.com', source)
    const a = r[0]
    expect(a.kind).toBe('url')
    expect(a.url).toBe('https://eastmoney.com')
  })

  it('普通词给出「搜索」动作（百度）', () => {
    const r = buildSuggestions('财报', source)
    const a = r[0]
    expect(a.kind).toBe('search')
    expect(a.url).toContain('baidu.com/s?wd=')
  })

  it('前缀匹配排在包含匹配之前', () => {
    const r = buildSuggestions('东', {
      bookmarks: [
        { title: '东方财富', url: 'https://eastmoney.com/' },
        { title: '京东金融', url: 'https://jr.jd.com/' },
      ],
      watchlist: [],
    })
    // 「动作」项（搜索）固定前置，这里只看书签召回的排序
    const bm = r.filter((s) => s.kind === 'bookmark').map((s) => s.title)
    expect(bm[0]).toBe('东方财富')
    expect(bm.indexOf('东方财富')).toBeLessThan(bm.indexOf('京东金融'))
  })

  it('超过 limit 截断', () => {
    const big: SuggestSource = {
      bookmarks: Array.from({ length: 20 }, (_, i) => ({ title: `站点${i}`, url: `https://s${i}.com` })),
      watchlist: [],
    }
    expect(buildSuggestions('站点', big, 5)).toHaveLength(5)
  })
})
