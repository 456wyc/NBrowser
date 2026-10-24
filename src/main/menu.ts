import { Menu, MenuItemConstructorOptions } from 'electron'
import { openLogDir } from './logger'

/**
 * 应用菜单 + 快捷键
 *
 * 为什么放主进程：网页始终保持焦点，如果只在渲染进程监听 keydown，
 * 用户点击页面后快捷键就失效了。菜单快捷键在应用级生效，不受内部焦点影响。
 */
export interface MenuActions {
  createTab: () => void
  closeTab: () => void
  reloadTab: () => void
  goBack: () => void
  goForward: () => void
  focusAddress: () => void
  /** 把当前标签弹出为独立窗口（多屏时可拖到另一块屏幕） */
  popoutTab: () => void
  /** 召唤 AI 助手（Copilot） */
  openCopilot: () => void
  /** 缩放当前网页（若无网页标签则缩放应用界面） */
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  /** 显示/隐藏 AI 桌宠浮窗 */
  togglePet: () => void
}

export function buildApplicationMenu(actions: MenuActions): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      id: 'menu-tabs',
      label: '标签',
      submenu: [
        { label: '新建标签', accelerator: 'CmdOrCtrl+T', click: actions.createTab },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: actions.closeTab },
        { type: 'separator' },
        { label: '后退', accelerator: 'Alt+Left', click: actions.goBack },
        { label: '前进', accelerator: 'Alt+Right', click: actions.goForward },
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: actions.reloadTab },
        { type: 'separator' },
        { label: '定位到地址栏', accelerator: 'CmdOrCtrl+L', click: actions.focusAddress },
        { type: 'separator' },
        {
          label: '弹出为独立窗口',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: actions.popoutTab,
        },
      ],
    },
    {
      id: 'menu-copilot',
      label: '助手',
      submenu: [
        { label: 'AI 助手', accelerator: 'CmdOrCtrl+K', click: actions.openCopilot },
        {
          label: '牛来',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: actions.togglePet,
        },
      ],
    },
    {
      id: 'menu-view',
      label: '视图',
      submenu: [
        // 快捷键由 before-input-event 直接接管（菜单 accelerator 在部分键盘布局下不命中，
        // 且与按键监听叠加会一次跳两档），菜单项保留鼠标点击入口
        { label: '放大  (Ctrl/Cmd +)', click: actions.zoomIn },
        { label: '缩小  (Ctrl/Cmd -)', click: actions.zoomOut },
        { label: '实际大小  (Ctrl/Cmd 0)', click: actions.resetZoom },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      id: 'menu-help',
      label: '帮助',
      submenu: [{ label: '打开日志目录', click: () => openLogDir() }],
    },
  ]

  return Menu.buildFromTemplate(template)
}
