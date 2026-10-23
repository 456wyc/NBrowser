/**
 * 通用空态
 *
 * 各页面「无数据 / 未开启」时统一展示：图标 + 标题 + 说明，居中留白，
 * 比单纯一行灰字更有层次，也不会和正文混在一起。
 */
export function EmptyState({
  icon = '📭',
  title,
  desc,
}: {
  icon?: React.ReactNode
  title: string
  desc?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
    </div>
  )
}
