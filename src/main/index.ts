import { app, BrowserWindow, Menu, ipcMain, dialog, webContents } from 'electron'
import { IPC_CHANNELS, type PingRequest, type PingResponse } from '@shared/ipc'
import { MainWindowManager } from './browser/main-window'
import { buildApplicationMenu } from './menu'
import {
  registerIpcHandlers,
  setMainWindowManager,
  setQuotePollingManager,
  setQuoteProvider,
} from './ipc-handlers'
import { getDb } from './db'
import { getAllNotesFull } from './db/notes'
import { reconcileNotesSync } from './notes-sync'
import type { Database } from 'sql.js'
import { EastmoneyProvider } from './quote/eastmoney-provider'
import { QuotePollingManager } from './quote/polling-manager'
import {
  ZoomManager,
  setZoomManager,
  attachZoomShortcuts,
  setZoomTargetSource,
  stepCurrentZoom,
} from './browser/zoom-manager'
import { getConfig } from './config'
import { initLogger } from './logger'

let mainWindowMgr: MainWindowManager | null = null
let quotePollingMgr: QuotePollingManager | null = null
let db: Database | null = null

// ---------- Ping handler (保留用于测试) ----------
function registerPingHandler(): void {
  ipcMain.handle(IPC_CHANNELS.PING, (_event, req: PingRequest): PingResponse => {
    if (!req || typeof req.message !== 'string') {
      throw new Error('Invalid ping request: message must be a string')
    }
    return {
      message: `pong: ${req.message}`,
      timestamp: Date.now(),
    }
  })
}

// ---------- 菜单与快捷键 ----------

function setupApplicationMenu(): void {
  const mgr = () => mainWindowMgr

  Menu.setApplicationMenu(
    buildApplicationMenu({
      createTab: () => mgr()?.getTabManager().createTab(undefined, true),
      closeTab: () => {
        const tm = mgr()?.getTabManager()
        const activeId = tm?.getActiveTabId()
        if (tm && activeId) tm.closeTab(activeId)
      },
      reloadTab: () => mgr()?.getTabManager().reloadTab(),
      goBack: () => mgr()?.getTabManager().goBack(),
      goForward: () => mgr()?.getTabManager().goForward(),
      focusAddress: () => {
        const win = mgr()?.getWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.APP_FOCUS_ADDRESS)
        }
      },
      // 缩放：优先缩放当前网页标签（与 Chrome 一致）；没有网页标签时缩放应用界面
      zoomIn: () => void stepCurrentZoom(1, { preferActiveTab: true }),
      zoomOut: () => void stepCurrentZoom(-1, { preferActiveTab: true }),
      resetZoom: () => void stepCurrentZoom(0, { preferActiveTab: true }),
    })
  )
}

// ---------- 应用生命周期 ----------

app.whenReady().then(async () => {
  // 日志落盘：必须在最前面初始化，之后所有 console 输出都会落一份到 userData/logs
  initLogger()

  // 初始化数据库（异步：sql.js 需要加载 wasm）
  try {
    db = await getDb()
    console.log('[main] Database initialized')
  } catch (err: any) {
    // 数据库起不来必须明确暴露，否则只会表现为「窗口不出现、没有任何提示」
    const detail = err?.message || String(err)
    console.error('[main] Database initialization failed:', detail)
    dialog.showErrorBox(
      '数据库初始化失败',
      `无法初始化本地数据库，应用无法启动。\n\n${detail}\n\n常见原因：node_modules 中缺少 sql.js 的 wasm 文件。`
    )
    app.quit()
    return
  }

  // 笔记 .md 自动同步：启动时全量对齐一次（写入全部 + 清理孤儿文件），失败不阻塞启动
  try {
    reconcileNotesSync(getAllNotesFull(db))
    console.log('[main] Notes .md sync reconciled')
  } catch (err: any) {
    console.error('[main] Notes .md sync reconcile failed:', err?.message || err)
  }

  // 初始化行情 Provider 和轮询管理器
  const quoteProvider = new EastmoneyProvider()
  // 轮询间隔读 config.json（设置页可改），不再硬编码
  const quoteCfg = getConfig().quote
  quotePollingMgr = new QuotePollingManager(quoteProvider, {
    tradingIntervalMs: quoteCfg.tradingIntervalMs,
    nonTradingIntervalMs: quoteCfg.nonTradingIntervalMs,
    stopWhenEmpty: true,
  })
  setQuoteProvider(quoteProvider)
  setQuotePollingManager(quotePollingMgr)
  // 网页缩放（按站点记忆，导航后自动恢复）
  setZoomManager(new ZoomManager(db))
  quotePollingMgr.start()
  console.log('[main] Quote polling started')

  // 注册 IPC handlers
  registerPingHandler()
  registerIpcHandlers()

  // 创建主窗口
  mainWindowMgr = new MainWindowManager(db)
  setMainWindowManager(mainWindowMgr)
  setupApplicationMenu()
  // 应用界面也支持 Ctrl/Cmd +/-/0：与 Chrome 一致，优先缩放当前网页标签，
  // 没有网页标签（焦点在侧栏/导航首页且无网页）时才缩放应用界面本身
  const shellWc = mainWindowMgr.getWindow()?.webContents
  if (shellWc) attachZoomShortcuts(shellWc, () => null, { preferActiveTab: true })
  // 缩放目标源（菜单 / 地址栏缩放控件 / IPC 共用同一套「当前内容」选择逻辑）
  const tm = mainWindowMgr.getTabManager()
  setZoomTargetSource({
    getAllTabs: () => tm.getAllTabs().map((t) => ({ id: t.id, url: t.url })),
    getWebContents: (tabId) => tm.getWebContents(tabId),
    getActiveTabId: () => tm.getActiveTabId(),
    getShellWebContents: () => mainWindowMgr?.getWindow()?.webContents ?? null,
  })
  console.log('[main] Main window created')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && db) {
    mainWindowMgr = new MainWindowManager(db)
    setMainWindowManager(mainWindowMgr)
    }
  })
}).catch((err: unknown) => {
  // 兜底：启动期的任何异常都要显式暴露，否则只会表现为「窗口没出现」
  const detail = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
  console.error('[main] Startup failed:', detail)
  dialog.showErrorBox('启动失败', `应用初始化时发生错误：\n\n${detail}`)
  app.quit()
})

app.on('window-all-closed', () => {
  // 停止行情轮询
  if (quotePollingMgr) {
    quotePollingMgr.stop()
    quotePollingMgr = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
