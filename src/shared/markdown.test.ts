import { describe, it, expect } from 'vitest'
import { parseMarkdown } from './markdown'

describe('parseMarkdown', () => {
  it('空文本返回空数组', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('解析标题层级', () => {
    const blocks = parseMarkdown('# 概览\n## 核心数据\n### 细节\n正文')
    expect(blocks).toEqual([
      { kind: 'h1', text: '概览' },
      { kind: 'h2', text: '核心数据' },
      { kind: 'h3', text: '细节' },
      { kind: 'p', text: '正文' },
    ])
  })

  it('连续的列表行合并为一个块', () => {
    const blocks = parseMarkdown('- 利好一\n- 利好二\n\n段落')
    expect(blocks).toEqual([
      { kind: 'ul', items: ['利好一', '利好二'] },
      { kind: 'p', text: '段落' },
    ])
  })

  it('支持 * 与有序列表', () => {
    const blocks = parseMarkdown('* A\n* B\n1. 第一\n2. 第二')
    expect(blocks[0]).toEqual({ kind: 'ul', items: ['A', 'B'] })
    expect(blocks[1]).toEqual({ kind: 'ol', items: ['第一', '第二'] })
  })

  it('多行段落合并为一段，空行才分段', () => {
    const blocks = parseMarkdown('第一行\n第二行\n\n新段落')
    expect(blocks).toEqual([
      { kind: 'p', text: '第一行\n第二行' },
      { kind: 'p', text: '新段落' },
    ])
  })

  it('忽略多余空行', () => {
    const blocks = parseMarkdown('A\n\n\n\nB')
    expect(blocks).toEqual([
      { kind: 'p', text: 'A' },
      { kind: 'p', text: 'B' },
    ])
  })
})
