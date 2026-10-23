/**
 * 顶栏右侧的布局控制区
 *
 * 只做一件事：控制各区域的显示。四个开关（主侧栏 / 辅助侧栏 / 底部面板 / 全屏）
 * 加一个「恢复默认布局」。尺寸调整交给各区域之间的拖拽手柄。
 *
 * 图标用内联 SVG 画出「布局示意」（实心块 = 对应区域），不用 Unicode 块字符——
 * 那类字符在不同字体下渲染差异大（.shtml 常被画成斜纹填充，难以辨认）。
 * 颜色走 currentColor：默认灰、激活蓝色（配合 .icon-btn.active 的背景高亮）。
 */

export function LayoutToolbar({
  sidebarOn,
  panelOn,
  dockOn,
  fullscreen,
  onToggleSidebar,
  onTogglePanel,
  onToggleDock,
  onToggleFullscreen,
  onReset,
}: {
  sidebarOn: boolean
  panelOn: boolean
  dockOn: boolean
  fullscreen: boolean
  onToggleSidebar: () => void
  onTogglePanel: () => void
  onToggleDock: () => void
  onToggleFullscreen: () => void
  onReset: () => void
}) {
  return (
    <div style={styles.bar}>
      <ToolBtn active={sidebarOn} title="显示/隐藏 主侧栏（空间与自选股）" onClick={onToggleSidebar}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {/* 左竖条实心（主侧栏）+ 右侧大区描边（网页区） */}
          <rect x="1" y="2.5" width="4.5" height="9" rx="1.5" fill="currentColor" />
          <rect
            x="7.5"
            y="2.5"
            width="5.5"
            height="9"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </ToolBtn>
      <ToolBtn active={panelOn} title="显示/隐藏 辅助侧栏（分析 / 研究 / 报告 / 复盘）" onClick={onTogglePanel}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {/* 左侧大区描边（网页区）+ 右竖条实心（辅助侧栏） */}
          <rect
            x="1"
            y="2.5"
            width="5.5"
            height="9"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect x="8.5" y="2.5" width="4.5" height="9" rx="1.5" fill="currentColor" />
        </svg>
      </ToolBtn>
      <ToolBtn active={dockOn} title="显示/隐藏 底部面板（浏览轨迹 / 运行日志）" onClick={onToggleDock}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {/* 上方大区描边（网页区）+ 底部横条实心（底部面板） */}
          <rect
            x="1"
            y="2.5"
            width="12"
            height="5.5"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect x="1" y="9.5" width="12" height="2" rx="1" fill="currentColor" />
        </svg>
      </ToolBtn>
      <ToolBtn active={fullscreen} title="全屏" onClick={onToggleFullscreen}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {/* 四角扩展括号 */}
          <path
            d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M9 2h1.5A1.5 1.5 0 0 1 12 3.5V5M12 9v1.5a1.5 1.5 0 0 1-1.5 1.5H9M5 12H3.5A1.5 1.5 0 0 1 2 10.5V9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </ToolBtn>
      <div className="divider" />
      <ToolBtn active={false} title="恢复默认布局" onClick={onReset}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {/* 逆时针旋转箭头 */}
          <path
            d="M11.5 7A4.5 4.5 0 1 1 9.6 3.4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M9.6 1.3l.4 2.4-2.4.4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ToolBtn>
    </div>
  )
}

function ToolBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`icon-btn${active ? ' active' : ''}`}
      style={active ? { color: 'var(--blue)' } : undefined}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '0 8px',
    height: 36,
    flexShrink: 0,
  },
}
