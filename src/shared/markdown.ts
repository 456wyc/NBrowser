/**
 * 极简 Markdown 解析（只需覆盖研究报告用到的语法）
 *
 * 放在 shared 是为了可单测，且渲染进程两处（代理面板、研究报告详情）共用同一份解析。
 * 只做块级切分，行内加粗/代码由渲染组件处理。
 */

export type MdBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string }

const H1 = /^#\s+/
const H2 = /^##\s+/
const H3 = /^###\s+/
const UL = /^\s*[-*]\s+/
const OL = /^\s*\d+[.)]\s+/

function isBlockStart(line: string): boolean {
  return H1.test(line) || H2.test(line) || H3.test(line) || UL.test(line) || OL.test(line)
}

export function parseMarkdown(text: string): MdBlock[] {
  if (!text) return []
  const lines = text.split('\n')
  const blocks: MdBlock[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // 空行：段落分隔
    if (line.trim() === '') {
      i++
      continue
    }

    if (H3.test(line)) {
      blocks.push({ kind: 'h3', text: line.replace(H3, '') })
      i++
      continue
    }
    if (H2.test(line)) {
      blocks.push({ kind: 'h2', text: line.replace(H2, '') })
      i++
      continue
    }
    if (H1.test(line)) {
      blocks.push({ kind: 'h1', text: line.replace(H1, '') })
      i++
      continue
    }

    // 无序列表：连续行合并为一个 ul
    if (UL.test(line)) {
      const items: string[] = []
      while (i < lines.length && UL.test(lines[i])) {
        items.push(lines[i].replace(UL, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // 有序列表
    if (OL.test(line)) {
      const items: string[] = []
      while (i < lines.length && OL.test(lines[i])) {
        items.push(lines[i].replace(OL, ''))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    // 普通段落：一直吃到空行或下一个块开始
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length > 0) blocks.push({ kind: 'p', text: para.join('\n') })
  }

  return blocks
}
