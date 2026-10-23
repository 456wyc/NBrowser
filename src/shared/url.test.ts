import { describe, it, expect } from 'vitest'
import { toNavigableUrl, isNavHomeUrl } from './url'

describe('toNavigableUrl', () => {
  it('空输入返回空字符串', () => {
    expect(toNavigableUrl('')).toBe('')
    expect(toNavigableUrl('   ')).toBe('')
  })

  it('保留显式的 http/https 链接', () => {
    expect(toNavigableUrl('https://xueqiu.com/S/SH600519')).toBe(
      'https://xueqiu.com/S/SH600519'
    )
    expect(toNavigableUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })

  it('给裸域名补全 https://', () => {
    expect(toNavigableUrl('xueqiu.com')).toBe('https://xueqiu.com')
    expect(toNavigableUrl('quote.eastmoney.com/sh600519.html')).toBe(
      'https://quote.eastmoney.com/sh600519.html'
    )
  })

  it('非 URL 输入走百度搜索', () => {
    expect(toNavigableUrl('贵州茅台 年报')).toBe(
      `https://www.baidu.com/s?wd=${encodeURIComponent('贵州茅台 年报')}`
    )
  })

  it('自动 trim', () => {
    expect(toNavigableUrl('  https://a.com  ')).toBe('https://a.com')
  })
})

describe('isNavHomeUrl', () => {
  it('识别应用内部新标签页地址', () => {
    expect(isNavHomeUrl('http://localhost:5173/#/nav')).toBe(true)
    expect(isNavHomeUrl('file:///app/out/renderer/index.html#/nav')).toBe(true)
  })

  it('普通网页与空值不算新标签页', () => {
    expect(isNavHomeUrl('https://xueqiu.com/S/SH600519')).toBe(false)
    expect(isNavHomeUrl('')).toBe(false)
  })
})
