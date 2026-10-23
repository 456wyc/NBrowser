import { describe, it, expect } from 'vitest'
import { filterSearchLinks } from './deep-agent'

describe('filterSearchLinks', () => {
  it('过滤掉非 http 链接与百度站内链接，并去重', () => {
    const links = [
      { text: '茅台公告', href: 'https://xueqiu.com/123' },
      { text: '搜索', href: 'https://www.baidu.com/s?wd=茅台' },
      { text: '百度首页', href: 'https://www.baidu.com/' },
      { text: '登录', href: 'https://www.baidu.com/login' },
      { text: '茅台公告', href: 'https://xueqiu.com/123' }, // 重复
      { text: '脚本', href: 'javascript:void(0)' },
      { text: '锚点', href: '#top' },
    ]
    const r = filterSearchLinks(links)
    expect(r).toHaveLength(1)
    expect(r[0].url).toBe('https://xueqiu.com/123')
    expect(r[0].title).toBe('茅台公告')
  })

  it('保留百度结果跳转链接（baidu.com/link）', () => {
    const links = [{ text: '东方财富', href: 'https://www.baidu.com/link?url=abc' }]
    const r = filterSearchLinks(links)
    expect(r).toHaveLength(1)
    expect(r[0].url).toContain('baidu.com/link')
  })
})
