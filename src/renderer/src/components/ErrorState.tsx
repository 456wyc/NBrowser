/**
 * 通用失败态
 *
 * 数据面板加载失败时不能静默降级成「暂无数据」——那会让用户以为是空的。
 * 这里统一展示：警示图标 + 原因（可省略）+ 重试按钮。
 */
export function ErrorState({
  title = '加载失败',
  desc,
  onRetry,
  retryText = '重试',
}: {
  title?: string
  desc?: React.ReactNode
  onRetry?: () => void
  retryText?: string
}) {
  return (
    <div className="empty-state error">
      <div className="icon">⚠️</div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
      {onRetry && (
        <button className="btn" onClick={onRetry} style={{ marginTop: 4 }}>
          {retryText}
        </button>
      )}
    </div>
  )
}
