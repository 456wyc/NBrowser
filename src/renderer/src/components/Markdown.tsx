import { parseMarkdown, type MdBlock } from '@shared/markdown'

/**
 * 研究报告的轻量 Markdown 渲染
 *
 * 只用原生元素渲染（不引第三方库、不用 dangerouslySetInnerHTML），
 * 覆盖代理产出报告用到的语法：标题、无序/有序列表、加粗、行内代码。
 */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  return (
    <div style={styles.container}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} keyPrefix={`b${i}`} />
      ))}
    </div>
  )
}

function Block({ block, keyPrefix }: { block: MdBlock; keyPrefix: string }) {
  switch (block.kind) {
    case 'h1':
      return <div style={styles.h1}>{inline(block.text, keyPrefix)}</div>
    case 'h2':
      return <div style={styles.h2}>{inline(block.text, keyPrefix)}</div>
    case 'h3':
      return <div style={styles.h3}>{inline(block.text, keyPrefix)}</div>
    case 'ul':
      return (
        <ul style={styles.ul}>
          {block.items.map((t, j) => (
            <li key={j} style={styles.li}>
              {inline(t, `${keyPrefix}-${j}`)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol style={styles.ol}>
          {block.items.map((t, j) => (
            <li key={j} style={styles.li}>
              {inline(t, `${keyPrefix}-${j}`)}
            </li>
          ))}
        </ol>
      )
    case 'p':
    default:
      return <div style={styles.p}>{inline(block.text, keyPrefix)}</div>
  }
}

/** 行内：**加粗** 与 `代码` */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let n = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      out.push(<strong key={`${keyPrefix}-s${n}`}>{token.slice(2, -2)}</strong>)
    } else {
      out.push(
        <code key={`${keyPrefix}-c${n}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>
      )
    }
    last = m.index + token.length
    n++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const styles: Record<string, React.CSSProperties> = {
  container: { fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)', wordBreak: 'break-word' },
  h1: { fontSize: 16, fontWeight: 700, margin: '10px 0 6px', color: 'var(--blue)' },
  h2: {
    fontSize: 14,
    fontWeight: 600,
    margin: '14px 0 6px',
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 4,
  },
  h3: { fontSize: 13, fontWeight: 600, margin: '10px 0 4px', color: 'var(--subtext0)' },
  p: { margin: '6px 0', whiteSpace: 'pre-wrap' },
  ul: { margin: '6px 0', paddingLeft: 20 },
  ol: { margin: '6px 0', paddingLeft: 20 },
  li: { margin: '2px 0' },
  inlineCode: {
    background: 'var(--surface0)',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 11.5,
    color: 'var(--green)',
  },
}
