import { useState } from 'react'

/**
 * 就地输入框：回车确认 / Esc 取消 / 失焦取消（点外部即取消）。
 * 用于顶栏、侧栏这类永远浮在 WebContentsView 之上的 DOM 区域，
 * 避免用 fixed 居中浮层（会被中间原生网页视图盖住、看不见）。
 */
export function InlineInput({
  initial = '',
  placeholder,
  width = 140,
  onConfirm,
  onCancel,
}: {
  initial?: string
  placeholder?: string
  width?: number | string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      className="field"
      autoFocus
      value={value}
      placeholder={placeholder}
      style={{ height: 24, width, fontSize: 13 }}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // 阻止冒泡，避免触发外层快捷键
        e.stopPropagation()
        if (e.key === 'Enter') {
          const t = value.trim()
          if (t) onConfirm(t)
        } else if (e.key === 'Escape') {
          onCancel()
        }
      }}
      onBlur={() => onCancel()}
    />
  )
}
