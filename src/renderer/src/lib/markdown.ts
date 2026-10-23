/**
 * 轻量 Markdown -> HTML 渲染（无需额外依赖）
 *
 * 覆盖常用语法：标题、粗体、斜体、行内代码、代码块、引用、分隔线、列表、链接。
 * 先做 HTML 转义再套用规则，链接仅允许 http(s)，避免 XSS。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(s: string): string {
  // 链接 [文本](http(s)://...) —— 只允许 http/https，杜绝 javascript: 等
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

export function renderMarkdown(src: string): string {
  const escaped = escapeHtml(src ?? '')
  const lines = escaped.split(/\r?\n/)
  let html = ''
  let inCode = false
  let listBuf: string[] = []

  const flushList = () => {
    if (listBuf.length) {
      html += '<ul>' + listBuf.map((i) => `<li>${i}</li>`).join('') + '</ul>'
      listBuf = []
    }
  }

  for (const raw of lines) {
    if (/^```/.test(raw.trim())) {
      if (inCode) {
        html += '</code></pre>'
        inCode = false
      } else {
        flushList()
        html += '<pre><code>'
        inCode = true
      }
      continue
    }
    if (inCode) {
      html += raw + '\n'
      continue
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushList()
      const lvl = h[1].length
      html += `<h${lvl}>${inline(h[2])}</h${lvl}>`
      continue
    }
    if (/^\s*>\s?/.test(raw)) {
      flushList()
      html += `<blockquote>${inline(raw.replace(/^\s*>\s?/, ''))}</blockquote>`
      continue
    }
    if (/^(---|\*\*\*|___)\s*$/.test(raw)) {
      flushList()
      html += '<hr/>'
      continue
    }
    const li = raw.match(/^\s*[-*+]\s+(.*)$/)
    if (li) {
      listBuf.push(inline(li[1]))
      continue
    }
    if (raw.trim() === '') {
      flushList()
      continue
    }
    flushList()
    html += `<p>${inline(raw)}</p>`
  }
  flushList()
  if (inCode) html += '</code></pre>'
  return html
}
