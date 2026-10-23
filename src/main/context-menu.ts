import { Menu, MenuItemConstructorOptions, clipboard } from 'electron'
import type { WebContents, BrowserWindow, ContextMenuParams } from 'electron'
import { extractStockFromUrl, extractStockFromText } from './stock-extractor'

export interface TabContextMenuDeps {
  window: BrowserWindow
  tabId: string
  tabUrl: string
  canCloseOthers: boolean
  canCloseRight: boolean
  onReload: (tabId: string) => void
  onClose: (tabId: string) => void
  onCloseOthers: (tabId: string) => void
  onCloseRight: (tabId: string) => void
}

/**
 * 标签右键菜单
 * 渲染进程无法直接使用 Electron 的 Menu，因此由主进程构建并弹出。
 */
export function buildTabContextMenu(deps: TabContextMenuDeps): Menu {
  const items: MenuItemConstructorOptions[] = [
    {
      label: '重新加载',
      click: () => deps.onReload(deps.tabId),
    },
    {
      label: '复制页面地址',
      enabled: Boolean(deps.tabUrl),
      click: () => clipboard.writeText(deps.tabUrl),
    },
    { type: 'separator' },
    {
      label: '关闭',
      click: () => deps.onClose(deps.tabId),
    },
    {
      label: '关闭其他标签',
      enabled: deps.canCloseOthers,
      click: () => deps.onCloseOthers(deps.tabId),
    },
    {
      label: '关闭右侧标签',
      enabled: deps.canCloseRight,
      click: () => deps.onCloseRight(deps.tabId),
    },
  ]

  return Menu.buildFromTemplate(items)
}

export interface WebContextMenuDeps {
  window: BrowserWindow
  webContents: WebContents
  /** 右键菜单里「整理选中文本」的回调（标题由调用方从 webContents 取） */
  onAnalyzeSelection: (text: string, url: string) => void
  /** 链接操作 */
  onOpenLink: (url: string, background: boolean) => void
  onAnalyzeLink: (url: string) => void
  onAddLinkToWatch: (symbol: string) => void
}

/**
 * 网页内右键菜单
 *
 * 挂在标签的 WebContents 上。网页始终持有焦点，
 * 所以选中文本的分析入口只能从这里提供，渲染进程拿不到网页里的选区。
 */
export function buildWebContextMenu(
  params: ContextMenuParams,
  deps: WebContextMenuDeps
): Menu {
  const selection = (params.selectionText || '').trim()
  const items: MenuItemConstructorOptions[] = []

  // 选中文本 -> AI 整理（仅在有选中内容时出现）
  if (selection.length >= 10) {
    items.push({
      label: '✨ 整理选中文本',
      click: () => deps.onAnalyzeSelection(selection, params.pageURL || ''),
    })
    items.push({ type: 'separator' })
  }

  if (params.linkURL) {
    const linkUrl = params.linkURL
    const linkText = (params.linkText || '').trim()
    items.push(
      {
        label: '在新标签打开',
        click: () => deps.onOpenLink(linkUrl, false),
      },
      {
        label: '在后台标签打开',
        click: () => deps.onOpenLink(linkUrl, true),
      },
      {
        label: '复制链接地址',
        click: () => clipboard.writeText(linkUrl),
      },
      {
        label: '✨ 用 AI 分析此链接',
        click: () => deps.onAnalyzeLink(linkUrl),
      }
    )

    // 若链接或文本能识别成股票代码，提供「加入自选股」
    const linkSymbol = extractStockFromUrl(linkUrl) || extractStockFromText(linkText)[0] || null
    if (linkSymbol) {
      items.push({
        label: `加入自选股（${linkSymbol}）`,
        click: () => deps.onAddLinkToWatch(linkSymbol),
      })
    }
  }
  if (selection) {
    items.push({
      label: '复制',
      enabled: params.editFlags.canCopy,
      click: () => deps.webContents.copy(),
    })
  }

  items.push({ type: 'separator' })
  items.push({ role: 'reload', label: '重新加载' })
  items.push({
    label: '后退',
    enabled: deps.webContents.canGoBack(),
    click: () => deps.webContents.goBack(),
  })
  items.push({
    label: '前进',
    enabled: deps.webContents.canGoForward(),
    click: () => deps.webContents.goForward(),
  })

  return Menu.buildFromTemplate(items)
}
