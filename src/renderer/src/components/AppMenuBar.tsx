import React from 'react'
import { IPC_CHANNELS } from '@shared/ipc'

// 主窗口隐藏了原生标题栏（titleBarStyle: hidden），没有原生菜单栏；
// 这里用一排自绘按钮复刻「标签 / 助手 / 视图 / 帮助」，点击在按钮位置弹出对应子菜单。
const MENUS = [
  { id: 'menu-tabs', label: '标签' },
  { id: 'menu-copilot', label: '助手' },
  { id: 'menu-view', label: '视图' },
  { id: 'menu-help', label: '帮助' },
] as const

export function AppMenuBar() {
  const open = (e: React.MouseEvent<HTMLButtonElement>, menuId: string) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    // 坐标相对窗口内容区（CSS 像素），与 Electron Menu.popup 的 window 坐标一致
    void window.electronAPI.invoke(IPC_CHANNELS.APP_SHOW_MENU, {
      menuId,
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 2),
    })
  }

  return (
    <div className="app-menubar no-drag">
      {MENUS.map((m) => (
        <button
          key={m.id}
          type="button"
          className="app-menubar-btn"
          onClick={(e) => open(e, m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
