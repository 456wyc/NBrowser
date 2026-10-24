import { describe, it, expect } from 'vitest'
import { summarizeAction, isActionTool } from './agent-actions'

describe('summarizeAction', () => {
  it('add_to_watchlist：带名称时展示 名称（代码）', () => {
    expect(summarizeAction('add_to_watchlist', { symbol: '600519.SH', name: '贵州茅台' })).toBe(
      '将 贵州茅台（600519.SH）加入自选股'
    )
  })

  it('add_to_watchlist：缺名称时只展示代码', () => {
    expect(summarizeAction('add_to_watchlist', { symbol: '600519.SH' })).toBe('将 600519.SH 加入自选股')
  })

  it('add_to_watchlist：缺代码时有占位而不是空串', () => {
    expect(summarizeAction('add_to_watchlist', {})).toBe('将 （未提供代码） 加入自选股')
  })

  it('create_note：标题 + 40 字预览', () => {
    const long = '一二三四五六七八九十'.repeat(10)
    const out = summarizeAction('create_note', { title: '茅台调研', content: long })
    expect(out).toContain('创建笔记《茅台调研》：')
    expect(out).toContain('…')
  })

  it('create_note：无正文时只展示标题', () => {
    expect(summarizeAction('create_note', { title: '待办' })).toBe('创建笔记《待办》')
  })

  it('create_note：缺标题时有占位', () => {
    expect(summarizeAction('create_note', { content: '随便记点什么' })).toContain('《未命名笔记》')
  })

  it('未知工具返回通用描述', () => {
    expect(summarizeAction('some_tool', { a: 1 })).toBe('执行操作 some_tool')
  })
})

describe('isActionTool', () => {
  it('识别行动工具', () => {
    expect(isActionTool('add_to_watchlist')).toBe(true)
    expect(isActionTool('create_note')).toBe(true)
  })

  it('读工具不是行动工具', () => {
    expect(isActionTool('get_watchlist')).toBe(false)
    expect(isActionTool('web_search')).toBe(false)
  })
})
