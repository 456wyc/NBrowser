import { describe, it, expect } from 'vitest'
import {
  analysisToNoteMarkdown,
  reportToNoteMarkdown,
  noteTitleFromPage,
} from './note-from-analysis'
import type { AiAnalysisView } from './ipc'

const sample: AiAnalysisView = {
  id: 1,
  url: 'https://example.com/announcement/1',
  title: '贵州茅台 2025 年第三季度报告',
  symbol: '600519.SH',
  pageType: 'announcement',
  mode: 'page',
  created_at: new Date(2026, 9, 23, 14, 30).getTime(),
  result: {
    summary: '前三季度营收与净利润同比增长，直销渠道占比提升。',
    bullish: [{ point: '净利润增长', evidence: '三季报净利润同比 +12%' }],
    bearish: [{ point: '批价下行', evidence: '' }],
    key_data: [
      { name: '营业总收入', value: '1200 亿元', period: '2025 前三季度' },
      { name: '净利润', value: '600 亿元' },
    ],
    uncertainties: ['第四季度指引未披露'],
    source_type: 'fact',
    truncated: true,
  },
}

describe('analysisToNoteMarkdown', () => {
  const md = analysisToNoteMarkdown(sample)

  it('包含标题、来源与元信息', () => {
    expect(md).toContain('# 贵州茅台 2025 年第三季度报告')
    expect(md).toContain('> 来源：https://example.com/announcement/1')
    expect(md).toContain('股票：600519.SH')
    expect(md).toContain('类型：公告')
  })

  it('利好/利空带原文依据（无依据时只列要点）', () => {
    expect(md).toContain('- **净利润增长**')
    expect(md).toContain('依据：三季报净利润同比 +12%')
    expect(md).toContain('- **批价下行**')
    expect(md).not.toContain('依据：\n')
  })

  it('关键数据用列表（不用表格，渲染器不支持）', () => {
    expect(md).toContain('- 营业总收入：1200 亿元（2025 前三季度）')
    expect(md).toContain('- 净利润：600 亿元')
    expect(md).not.toContain('|')
  })

  it('存疑点、截断提示、合规声明都在', () => {
    expect(md).toContain('- 第四季度指引未披露')
    expect(md).toContain('原文过长')
    expect(md).toContain('仅供参考，不构成投资建议')
  })

  it('社区观点类内容标注「观点而非事实」', () => {
    const opinion = analysisToNoteMarkdown({
      ...sample,
      pageType: 'community',
      result: { ...sample.result, source_type: 'opinion' },
    })
    expect(opinion).toContain('以上内容为观点而非事实')
  })
})

describe('reportToNoteMarkdown', () => {
  it('报告正文 + 来源信息 + 合规声明', () => {
    const md = reportToNoteMarkdown('茅台基本面研究', '# 概览\n结论…', sample.created_at)
    expect(md).toContain('# 茅台基本面研究')
    expect(md).toContain('深度研究生成')
    expect(md).toContain('# 概览\n结论…')
    expect(md).toContain('不构成投资建议')
  })
})

describe('noteTitleFromPage', () => {
  it('带股票代码时追加代码', () => {
    expect(noteTitleFromPage('茅台三季报', '600519.SH')).toBe('茅台三季报（600519.SH）')
  })

  it('无代码/空标题有兜底', () => {
    expect(noteTitleFromPage('茅台三季报', null)).toBe('茅台三季报')
    expect(noteTitleFromPage('', null)).toBe('未命名页面')
  })
})
