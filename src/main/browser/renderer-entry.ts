import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import type { BrowserWindow } from 'electron'

/**
 * 让一个 BrowserWindow 加载渲染进程页面，并定位到指定 hash 路由
 *
 * 渲染进程目前有两个入口：
 * - `#/nav`：新标签页的导航首页
 * - `#/popout?tab=<id>`：独立窗口外壳（极简地址栏 + 网页区占位）
 *
 * 开发态直接拼 dev server URL；生产态与 tab-manager 一样按候选路径探测
 * （out/renderer/index.html 与 asar 内的路径不同），避免写死后打包就白屏。
 */
export function loadRendererEntry(win: BrowserWindow, hashPath: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(`${devUrl}/#${hashPath}`)
    return
  }

  const candidates: string[] = [
    join(__dirname, '../renderer/index.html'),
    join(__dirname, '../../renderer/index.html'),
    join(process.resourcesPath ?? '', 'app.asar/out/renderer/index.html'),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        void win.loadFile(candidate, { hash: hashPath })
        return
      }
    } catch {
      // 该候选不可用，继续尝试下一个
    }
  }
  console.error(
    '[window] 未定位到渲染进程页面 renderer/index.html，独立窗口外壳降级为占位页。已尝试：',
    candidates
  )
  void win.loadURL('data:text/html,<h1>独立窗口</h1><p>未找到渲染进程页面</p>')
}

/** 渲染进程页面的 URL（供新标签页 / 独立窗口拼路由用），找不到时返回 null */
export function rendererEntryUrl(hashPath: string): string | null {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) return `${devUrl}/#${hashPath}`

  const candidates: string[] = [
    join(__dirname, '../renderer/index.html'),
    join(__dirname, '../../renderer/index.html'),
    join(process.resourcesPath ?? '', 'app.asar/out/renderer/index.html'),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        return `${pathToFileURL(candidate).href}#${hashPath}`
      }
    } catch {
      // 继续探测
    }
  }
  return null
}
