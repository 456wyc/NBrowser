import { type BrowserWindow, WebContentsView } from 'electron'

/**
 * 在屏幕外的无头 WebContentsView 中加载一个 URL 并执行回调，
 * 完成后自动销毁。用于「分析任意链接」「深度代理抓取」等不需要用户可见标签的场景。
 *
 * 注意：加载是异步的，loadURL 会在导航提交后 resolve；
 * 这里再额外等待一小段以容纳由脚本动态渲染的正文。
 */
export async function runInHeadlessPage<T>(
  window: BrowserWindow,
  url: string,
  fn: (webContents: import('electron').WebContents) => Promise<T>,
  opts: { settleMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const { settleMs = 600, timeoutMs = 20000 } = opts

  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 放到屏幕外，避免闪现真实标签
  view.setBounds({ x: -10000, y: -10000, width: 1024, height: 768 })
  window.contentView.addChildView(view)

  try {
    await Promise.race([
      view.webContents.loadURL(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('页面加载超时')), timeoutMs)
      ),
    ])
    if (settleMs > 0) {
      await new Promise((r) => setTimeout(r, settleMs))
    }
    return await fn(view.webContents)
  } finally {
    if (window.contentView.children.includes(view)) {
      window.contentView.removeChildView(view)
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close()
    }
  }
}
