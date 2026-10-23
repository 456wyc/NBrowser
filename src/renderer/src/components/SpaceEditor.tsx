import { useState } from 'react'

/** 预置图标集：只保留 Windows（Segoe UI Emoji）确定有字形的常见 emoji，
 *  避免 🪙/🗒/🛠/⚙ 之类渲染成空白格造成网格残缺 */
const ICONS = [
  '📊', '📈', '📉', '💰', '💎', '🏦',
  '🎯', '🔍', '💡', '📝', '📅', '📌',
  '⭐', '🔥', '🚀', '📁', '⚡', '✅',
]

/**
 * 空间编辑器（内嵌卡片，非浮层——必须渲染在侧栏等 DOM 可见区内）：
 * 名称 + 图标网格，供新建与编辑复用。
 */
export function SpaceEditor({
  initialName = '',
  initialIcon,
  saveLabel = '保存',
  onSave,
  onCancel,
  onDelete,
}: {
  initialName?: string
  initialIcon?: string
  saveLabel?: string
  onSave: (name: string, icon: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState(initialIcon ?? ICONS[0])
  const canSave = name.trim().length > 0

  return (
    <div style={styles.box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <input
          className="field"
          autoFocus
          value={name}
          maxLength={12}
          placeholder="空间名称"
          style={{ flex: 1, minWidth: 0, height: 26, fontSize: 13 }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // 阻止冒泡，避免触发外层快捷键
            e.stopPropagation()
            if (e.key === 'Enter' && canSave) onSave(name.trim(), icon)
            if (e.key === 'Escape') onCancel()
          }}
        />
      </div>

      <div style={styles.iconGrid}>
        {ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={'icon-cell' + (icon === ic ? ' active' : '')}
            title={icon === ic ? '当前图标' : '选择该图标'}
          >
            {ic}
          </button>
        ))}
      </div>

      <div style={styles.actions}>
        {onDelete ? (
          <button className="btn-danger" onClick={onDelete}>
            删除空间
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn-primary"
            disabled={!canSave}
            onClick={() => onSave(name.trim(), icon)}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  },
  iconGrid: {
    display: 'grid',
    // auto-fill：按容器宽度自动决定列数（每列最小 30px），宽面板多列、窄侧栏少列，
    // 避免固定列数在宽容器里把间距拉得稀疏
    gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))',
    gap: 4,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
}
