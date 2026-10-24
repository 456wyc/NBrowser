/**
 * 研究结果 → 笔记（Markdown）转换（纯函数）
 *
 * 三个入口共用：AI 分析结果（快览）、深度研究报告、Copilot 建笔记。
 * 注意：项目内置的 Markdown 渲染器只支持标题/列表/加粗/行内代码，**不支持表格**，
 * 因此关键数据用列表呈现。
 */

import type { AiAnalysisView, PageType } from './ipc'

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  announcement: '公告',
  news: '新闻',
  financial_report: '财报',
  community: '社区讨论',
  general: '通用',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function truncate(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 从页面标题 + 股票代码派生笔记标题 */
export function noteTitleFromPage(pageTitle: string, symbol: string | null): string {
  const base = truncate(pageTitle || '', 24) || '未命名页面'
  return symbol ? `${base}（${symbol}）` : base
}

/** AI 分析结果 → 笔记 Markdown */
export function analysisToNoteMarkdown(item: AiAnalysisView): string {
  const r = item.result
  const lines: string[] = []

  lines.push(`# ${truncate(item.title || '未命名页面', 60)}`)
  lines.push('')
  lines.push(`> 来源：${item.url}`)
  const meta: string[] = []
  if (item.symbol) meta.push(`股票：${item.symbol}`)
  meta.push(`类型：${PAGE_TYPE_LABEL[item.pageType] ?? item.pageType}`)
  meta.push(`整理时间：${formatTime(item.created_at)}`)
  lines.push(`> ${meta.join(' · ')}`)
  lines.push('')

  if (r.summary) {
    lines.push('## 摘要')
    lines.push('')
    lines.push(r.summary)
    lines.push('')
  }

  if (r.bullish?.length) {
    lines.push('## 利好因素')
    lines.push('')
    for (const b of r.bullish) {
      lines.push(`- **${b.point}**`)
      if (b.evidence) lines.push(`  - 依据：${b.evidence}`)
    }
    lines.push('')
  }

  if (r.bearish?.length) {
    lines.push('## 利空 / 风险')
    lines.push('')
    for (const b of r.bearish) {
      lines.push(`- **${b.point}**`)
      if (b.evidence) lines.push(`  - 依据：${b.evidence}`)
    }
    lines.push('')
  }

  if (r.key_data?.length) {
    lines.push('## 关键数据')
    lines.push('')
    for (const k of r.key_data) {
      const period = k.period ? `（${k.period}）` : ''
      lines.push(`- ${k.name}：${k.value}${period}`)
    }
    lines.push('')
  }

  if (r.uncertainties?.length) {
    lines.push('## 存疑点')
    lines.push('')
    for (const u of r.uncertainties) lines.push(`- ${u}`)
    lines.push('')
  }

  // 合规与口径提示必须随内容一起沉淀
  if (r.source_type === 'opinion') {
    lines.push('> ⚠️ 来源为社区讨论，以上内容为观点而非事实。')
    lines.push('')
  }
  if (r.truncated) {
    lines.push('> ⚠️ 原文过长，本次整理基于截断后的内容。')
    lines.push('')
  }
  lines.push('> 本笔记由 AI 整理生成，仅供参考，不构成投资建议。')

  return lines.join('\n')
}

/** 深度研究报告 → 笔记 Markdown（报告本身已是 Markdown，补来源信息） */
export function reportToNoteMarkdown(query: string, report: string, createdAt: number): string {
  const lines: string[] = []
  lines.push(`# ${truncate(query || '研究报告', 60)}`)
  lines.push('')
  lines.push(`> 深度研究生成 · ${formatTime(createdAt)}`)
  lines.push('')
  lines.push(report.trim())
  lines.push('')
  lines.push('> 本笔记由 AI 研究生成，仅供参考，不构成投资建议。')
  return lines.join('\n')
}
