import { ipcMain, dialog, app, BrowserWindow, Menu, shell, webContents } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  SpacesGetAllRequest,
  SpacesGetAllResponse,

  SpacesSwitchRequest,
  SpacesSwitchResponse,
  SpacesCreateRequest,
  SpacesCreateResponse,
  SpacesUpdateRequest,
  SpacesUpdateResponse,
  SpacesDeleteRequest,
  SpacesDeleteResponse,
  TabsGetAllRequest,
  TabsGetAllResponse,
  TabsGetActiveRequest,
  TabsGetActiveResponse,
  TabsCreateRequest,
  TabsCreateResponse,
  TabsCloseRequest,
  TabsCloseResponse,
  TabsSwitchRequest,
  TabsSwitchResponse,
  TabsReloadRequest,
  TabsReloadResponse,
  TabsGoBackRequest,
  TabsGoBackResponse,
  TabsGoForwardRequest,
  TabsGoForwardResponse,
  TabsNavigateRequest,
  TabsNavigateResponse,
  TabsReorderRequest,
  TabsReorderResponse,
  TabsPopoutRequest,
  TabsPopoutResponse,
  AppShowMenuRequest,
  AppShowMenuResponse,
  WindowsGetAllRequest,
  WindowsGetAllResponse,
  WindowsFocusRequest,
  WindowsFocusResponse,
  WindowsCloseRequest,
  WindowsCloseResponse,
  WindowsCloseAllRequest,
  WindowsCloseAllResponse,
  WindowsSetBoundsRequest,
  WindowsSetBoundsResponse,
  WindowsGetTabsRequest,
  WindowsGetTabsResponse,
  WindowsNewTabRequest,
  WindowsNewTabResponse,
  WindowsSwitchTabRequest,
  WindowsSwitchTabResponse,
  WindowsCloseTabRequest,
  WindowsCloseTabResponse,
  WindowsReturnTabRequest,
  WindowsReturnTabResponse,

  TabsShowContextMenuRequest,
  TabsShowContextMenuResponse,
  TradesGetAllRequest,
  TradesGetAllResponse,
  TradesAddRequest,
  TradesAddResponse,
  TradesUpdateRequest,
  TradesUpdateResponse,
  TradesDeleteRequest,
  TradesDeleteResponse,
  TradesImportParseRequest,
  TradesImportParseResponse,
  TradesImportBulkRequest,
  TradesImportBulkResponse,
  TradesParseNaturalRequest,
  TradesParseNaturalResponse,
  TradesGetContextRequest,
  TradesGetContextResponse,
  ParsedTrade,

  ReviewsSaveRequest,
  ReviewsSaveResponse,
  ReviewsDeleteRequest,
  ReviewsDeleteResponse,
  BookmarksGetAllRequest,
  BookmarksGetAllResponse,
  BookmarksAddRequest,
  BookmarksAddResponse,
  BookmarksDeleteRequest,
  BookmarksDeleteResponse,
  BookmarksUpdateRequest,
  BookmarksUpdateResponse,
  BookmarksReorderRequest,
  BookmarksReorderResponse,
  BookmarkGroupsGetRequest,
  BookmarkGroupsGetResponse,
  BookmarkGroupsCreateRequest,
  BookmarkGroupsCreateResponse,
  BookmarkGroupsUpdateRequest,
  BookmarkGroupsUpdateResponse,
  BookmarkGroupsDeleteRequest,
  BookmarkGroupsDeleteResponse,
  BookmarksSetGroupRequest,
  BookmarksSetGroupResponse,

  WindowSetWebAreaBoundsRequest,
  WindowSetWebAreaBoundsResponse,
  AppLogTailRequest,
  AppLogTailResponse,
  AppLogOpenDirRequest,
  WindowToggleFullscreenRequest,
  WindowToggleFullscreenResponse,
  WatchlistGetAllRequest,
  WatchlistGetAllResponse,
  WatchlistAddRequest,
  WatchlistAddResponse,
  WatchlistRemoveRequest,
  WatchlistRemoveResponse,
  WatchlistReorderRequest,
  WatchlistReorderResponse,
  WatchlistSearchRequest,
  WatchlistSearchResponse,
  QuotesGetLatestRequest,
  QuotesGetLatestResponse,
  QuotesRefreshRequest,
  QuotesRefreshResponse,
  QuoteHistoryGetRequest,
  QuoteHistoryGetResponse,
  QuoteSourceInfo,
  QuoteSourceTestRequest,
  QuoteSourceTestResponse,

  PageVisitsGetSummaryRequest,
  PageVisitsGetSummaryResponse,
  PageVisitsGetByStockRequest,
  PageVisitsGetByStockResponse,
  PageVisitsExportRequest,
  PageVisitsExportResponse,
  PageVisitsDeleteRequest,
  PageVisitsDeleteResponse,
  PageVisitsClearAllRequest,
  PageVisitsClearAllResponse,
  SettingsGetTrackingEnabledRequest,
  SettingsGetTrackingEnabledResponse,
  SettingsSetTrackingEnabledRequest,
  SettingsSetTrackingEnabledResponse,
  SettingsGetSessionRestoreRequest,
  SettingsGetSessionRestoreResponse,
  SettingsSetSessionRestoreRequest,
  SettingsSetSessionRestoreResponse,
  SettingsGetBlacklistRequest,
  SettingsGetBlacklistResponse,
  SettingsSetBlacklistRequest,
  SettingsGetSearchEngineRequest,
  SettingsGetSearchEngineResponse,
  SettingsSetSearchEngineRequest,
  SettingsSetSearchEngineResponse,
  SettingsGetQuoteIntervalRequest,
  SettingsGetQuoteIntervalResponse,
  SettingsSetQuoteIntervalRequest,
  SettingsSetQuoteIntervalResponse,
  SettingsSetBlacklistResponse,
  SettingsGetTradingCalendarRequest,
  SettingsGetTradingCalendarResponse,
  SettingsSetTradingCalendarRequest,
  SettingsSetTradingCalendarResponse,
  AiAnalyzePageRequest,
  AiAnalyzePageResponse,
  AiAnalyzeTextRequest,
  AiAnalyzeTextResponse,
  AiGetHistoryRequest,
  AiGetHistoryResponse,
  AiDeleteRecordRequest,
  AiDeleteRecordResponse,
  AiGetConfigRequest,
  AiGetConfigResponse,
  AiSetConfigRequest,
  AiSetConfigResponse,
  WebGetLinksRequest,
  WebGetLinksResponse,
  WebLink,

  AgentRunRequest,
  AgentEvent,
  AgentStopRequest,
  AgentChatRequest,
  AgentChatResponse,
  AgentConfirmActionRequest,
  AgentConfirmActionResponse,
  AgentSessionsListResponse,
  AgentSessionGetResponse,
  AgentSessionDeleteRequest,
  AgentSessionDeleteResponse,
  PageAgentStartRequest,
  PageAgentStartResponse,
  PageAgentStopRequest,
  PageAgentStopResponse,
  PageAgentEvent,
  PetToggleRequest,
  PetToggleResponse,
  PetSetSizeRequest,
  PetSetSizeResponse,
  PetNotifyPayload,
  PetGetConfigRequest,
  PetGetConfigResponse,
  PetSetConfigRequest,
  PetSetConfigResponse,
  WatchlistGroupsGetRequest,
  WatchlistGroupsGetResponse,
  WatchlistGroupCreateRequest,
  WatchlistGroupCreateResponse,
  WatchlistGroupUpdateRequest,
  WatchlistGroupUpdateResponse,
  WatchlistGroupDeleteRequest,
  WatchlistGroupDeleteResponse,
  WatchlistSetGroupRequest,
  WatchlistSetGroupResponse,
  WatchlistUpdateRequest,
  WatchlistUpdateResponse,
  ResearchListRequest,
  ResearchListResponse,
  ResearchGetRequest,
  ResearchGetResponse,
  ResearchDeleteRequest,
  ResearchDeleteResponse,
  ResearchExportRequest,
  ResearchExportResponse,
  AgentGetCapabilitiesRequest,
  AgentGetCapabilitiesResponse,
  AgentSetCapabilitiesRequest,
  AgentSetCapabilitiesResponse,
  AgentTestMcpRequest,
  AgentTestMcpResponse,
  StrategyGenerateRequest,
  StrategyGenerateResponse,
  StrategySaveRequest,
  StrategySaveResponse,
  StrategyListRequest,
  StrategyListResponse,
  StrategyGetRequest,
  StrategyGetResponse,
  StrategyDeleteRequest,
  StrategyDeleteResponse,
  StrategyBacktestRequest,
  StrategyBacktestResponse,
  StrategyRunRequest,
  StrategyRunResponse,
  StrategyStopRequest,
  StrategyStopResponse,
  StrategyStopAllResponse,
  StrategyCheckRequest,
  StrategyCheckResponse,
  AppZoomRequest,
  AppZoomResponse,
  StrategyStatusRequest,
  StrategyStatusResponse,
  StrategySignalsRequest,
  StrategySignalsResponse,
  NoteMessage,
  NoteSummary,
  Note,
  NotesGetAllRequest,
  NotesGetAllResponse,
  NotesGetRequest,
  NotesGetResponse,
  NotesSaveRequest,
  NotesSaveResponse,
  NotesDeleteRequest,
  NotesDeleteResponse,
  NotesChatRequest,
  NotesChatResponse,
  NotesKbQueryRequest,
  NotesKbQueryResponse,
  NotesSearchRequest,
  NotesSearchResponse,
  NotesExportRequest,
  NotesExportResponse,
  NotesSyncDirResponse,
  NotesUpdatedEvent,
  ThemeGetResponse,
  ThemeSetRequest,
  ShellOpenRequest,
  ShellOpenResponse,
} from '@shared/ipc'
import { aiService } from '../ai/service'
import { generateStrategy } from '../ai/strategy'
import { backtestStrategy } from '../strategy/backtest'
import { StrategyRunner } from '../strategy/runner'
import { stepCurrentZoom } from '../browser/zoom-manager'
import {
  listStrategies,
  getStrategy,
  addStrategy,
  updateStrategy,
  deleteStrategy,
} from '../db/strategies'
import { getSignals } from '../db/strategy-signals'
import { buildTabContextMenu } from '../context-menu'
import { DeepResearchAgent } from '../agent/deep-agent'
import { CopilotAgent } from '../agent/copilot'
import { testMcpServer } from '../agent/mcp-client'
import { runPageAgent } from '../agent/page-controller'
import { togglePetWindow, setPetSize, getPetWindow, isPetVisible } from '../browser/pet-window'
import { listSessions, getSession, deleteSession, parseSessionMessages } from '../db/agent-sessions'
import { addReport, listReports, getReport, deleteReport } from '../db/research-reports'
import {
  listNotes,
  getNote,
  saveNote,
  deleteNote,
  getAllNotesForKb,
  searchNotes,
  getAllNotesFull,
} from '../db/notes'
import { retrieveTopK, getNotesNeedingEmbedding, setNoteEmbedding } from '../ai/rag'
import { embedText } from '../ai/embeddings'
import { syncNoteToFile, removeNoteFile, getNotesSyncDir } from '../notes-sync'
import type { MainWindowManager } from '../browser/main-window'
import { getDb } from '../db'
import {
  getAllBookmarks,
  addBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
  getBookmarkGroups,
  createBookmarkGroup,
  updateBookmarkGroup,
  deleteBookmarkGroup,
  setBookmarkGroup,
} from '../db/bookmarks'
import {
  getAllWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  setWatchlistGroup,
  renameWatchlistItem,
  seedSmartGroups,
} from '../db/watchlist'
import {
  getTodayStockSummary,
  getVisitsByStockAndDate,
  getVisitsByDate,
  getVisitsBySymbolAndRange,
  deleteVisit,
  clearAllVisits,
} from '../db/page-visits'
import { getAnalysesBySymbolAndRange } from '../db/ai-analyses'
import { selectDecisionContext, extractSummary, AFTER_WINDOW_MS } from '@shared/review-context'
import {
  isTrackingEnabled,
  setTrackingEnabled,
  getSearchEngineTemplate,
  setSearchEngineTemplate,
  getDomainBlacklist,
  setDomainBlacklist,
  getTradingCalendar,
  setTradingCalendar,
  getSpaces,
  isSessionRestoreEnabled,
  setSessionRestoreEnabled,
} from '../db/settings'
import {
  addTrade,
  updateTrade,
  deleteTrade,
  getTrades,
  getTradeById,
  getReviewNote,
  saveReviewNote,
  deleteReviewNote,
} from '../db/trades'
import { addQuoteHistoryBatch, getQuoteHistory } from '../db/quote-history'
import { DEFAULT_CALENDAR } from '../quote/trading-calendar'
import { parseBrokerStatement, parseBrokerStatementWithLLM } from '../import/broker-import'
import {
  naturalTradeSystemPrompt,
  naturalTradeUserPrompt,
  sanitizeNaturalTrades,
} from '../import/natural-trade'
import { extractStockFromUrl, extractStockFromText } from '../stock-extractor'
import { normalizeSymbol } from '@shared/stock-market'
import { summarizeAction } from '@shared/agent-actions'
import { createQuoteProvider } from '../quote/provider-factory'
import type { CustomQuoteConfig } from '../quote/custom-http-provider'
import { getConfig, updateConfig, DEFAULT_PET_SYSTEM_PROMPT } from '../config'
import { LLMClient } from '../ai/llm-client'
import { toCsv } from '@shared/csv'
import { writeFileSync } from 'fs'
import { tailLogLines, getTodayLogFile, openLogDir } from '../logger'
import type { QuotePollingManager } from '../quote/polling-manager'
import type { QuoteProvider } from '../quote/provider'

let mainWindowManager: MainWindowManager | null = null
let quotePollingManager: QuotePollingManager | null = null

/** 报告导出时的时间格式化（本地时区 YYYY-MM-DD HH:mm） */
function formatReportTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 研究模式中文标签 */
function reportModeLabel(mode: string): string {
  return mode === 'deepen' ? '深挖当前页' : '自主研究'
}
let quoteProvider: QuoteProvider | null = null

export function setMainWindowManager(mgr: MainWindowManager): void {
  mainWindowManager = mgr
}

export function setQuotePollingManager(mgr: QuotePollingManager): void {
  quotePollingManager = mgr
}

export function setQuoteProvider(provider: QuoteProvider): void {
  quoteProvider = provider
}

function getMgr(): MainWindowManager {
  if (!mainWindowManager) throw new Error('MainWindowManager not initialized')
  return mainWindowManager
}

/**
 * 取标签所属空间的标签管理器
 *
 * 独立窗口里的标签可能属于非当前空间（弹出后用户在主窗口切了空间），
 * 传了 tabId 就按它定位，否则用当前空间。定位不到才回落到当前空间。
 */
function tabManagerForTab(tabId?: string) {
  const mgr = getMgr()
  if (tabId) {
    const owner = mgr.getTabManagerForTab(tabId)
    if (owner) return owner
  }
  return mgr.getTabManager()
}

function getQuoteMgr(): QuotePollingManager {
  if (!quotePollingManager) throw new Error('QuotePollingManager not initialized')
  return quotePollingManager
}

function getQuoteProvider(): QuoteProvider {
  if (!quoteProvider) throw new Error('QuoteProvider not initialized')
  return quoteProvider
}

/**
 * 注册所有 IPC handler
 * 每个 handler 都对入参做基础校验，不信任渲染进程
 */
export function registerIpcHandlers(): void {
  // ---------- Spaces（列表持久化在 settings，支持自定义） ----------

  ipcMain.handle(
    IPC_CHANNELS.SPACES_GET_ALL,
    (): SpacesGetAllResponse => {
      return {
        spaces: getMgr().getSpacesFromDb(),
        activeSpaceId: getMgr().getActiveSpace(),
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SPACES_SWITCH, (_event, req: SpacesSwitchRequest): SpacesSwitchResponse => {
    if (!req || typeof req.spaceId !== 'string') {
      throw new Error('Invalid spaces:switch request')
    }
    const mgr = getMgr()
    const validSpaceIds = mgr.getSpacesFromDb().map((s) => s.id)
    if (!validSpaceIds.includes(req.spaceId)) {
      throw new Error(`Invalid space id: ${req.spaceId}`)
    }
    const result = mgr.switchSpace(req.spaceId)
    return { success: true, ...result }
  })

  ipcMain.handle(
    IPC_CHANNELS.SPACES_CREATE,
    (_event, req: SpacesCreateRequest): SpacesCreateResponse => {
      if (!req || typeof req.name !== 'string' || !req.name.trim()) {
        throw new Error('空间名称不能为空')
      }
      if (req.name.trim().length > 12) {
        throw new Error('空间名称最多 12 个字')
      }
      return { space: getMgr().createSpace(req.name, req.icon) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SPACES_UPDATE,
    (_event, req: SpacesUpdateRequest): SpacesUpdateResponse => {
      if (!req || typeof req.spaceId !== 'string') {
        throw new Error('Invalid spaces:update request: spaceId required')
      }
      return {
        space: getMgr().updateSpace(req.spaceId, { name: req.name, icon: req.icon }),
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SPACES_DELETE,
    (_event, req: SpacesDeleteRequest): SpacesDeleteResponse => {
      if (!req || typeof req.spaceId !== 'string') {
        throw new Error('Invalid spaces:delete request: spaceId required')
      }
      const closedTabs = getMgr().removeSpace(req.spaceId)
      return { success: true, closedTabs }
    }
  )

  // ---------- Tabs ----------

  ipcMain.handle(IPC_CHANNELS.TABS_GET_ALL, (): TabsGetAllResponse => {
    const tm = getMgr().getTabManager()
    return {
      tabs: tm.getAllTabs(),
      activeTabId: tm.getActiveTabId(),
    }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_GET_ACTIVE, (): TabsGetActiveResponse => {
    const tm = getMgr().getTabManager()
    return { tab: tm.getActiveTab() }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_CREATE, (event, req: TabsCreateRequest): TabsCreateResponse => {
    if (req && req.url !== undefined && typeof req.url !== 'string') {
      throw new Error('Invalid tabs:create request: url must be string')
    }
    const mgr = getMgr()
    // 从独立窗口的页面里「开新标签」（导航首页卡片 / window.open）：
    // 开成**同一个窗口里的新一页**，而不是塞回主窗口、也不是再弹一个新 OS 窗口
    const senderTabId = mgr.findTabIdByWebContents(event.sender)
    const senderWindowId = senderTabId ? mgr.getPopoutManager().windowIdOf(senderTabId) : null
    const tm = senderTabId ? tabManagerForTab(senderTabId) : tabManagerForTab()
    const tab = tm.createTab(req?.url, (req?.active !== false) && !senderWindowId)
    if (senderWindowId) mgr.getPopoutManager().addTabToWindow(senderWindowId, tab.id)
    return { tab }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_CLOSE, (_event, req: TabsCloseRequest): TabsCloseResponse => {
    if (!req || typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:close request: tabId required')
    }
    const tm = getMgr().getTabManager()
    const result = tm.closeTab(req.tabId)
    return {
      success: result.success,
      tabs: tm.getAllTabs(),
      activeTabId: result.activeTabId,
    }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_SWITCH, (_event, req: TabsSwitchRequest): TabsSwitchResponse => {
    if (!req || typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:switch request: tabId required')
    }
    const tm = getMgr().getTabManager()
    const success = tm.switchTab(req.tabId)
    return { success }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_RELOAD, (event, req: TabsReloadRequest): TabsReloadResponse => {
    if (req?.tabId !== undefined && typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:reload request')
    }
    // 不带 tabId 时按「发起请求的标签页」定位（独立窗口里的页面刷新的是自己）
    const tabId = req?.tabId ?? getMgr().findTabIdByWebContents(event.sender) ?? undefined
    const success = tabManagerForTab(tabId).reloadTab(tabId)
    return { success }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_GO_BACK, (event, req: TabsGoBackRequest): TabsGoBackResponse => {
    if (req?.tabId !== undefined && typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:goBack request')
    }
    const tabId = req?.tabId ?? getMgr().findTabIdByWebContents(event.sender) ?? undefined
    const success = tabManagerForTab(tabId).goBack(tabId)
    return { success }
  })

  ipcMain.handle(IPC_CHANNELS.TABS_GO_FORWARD, (event, req: TabsGoForwardRequest): TabsGoForwardResponse => {
    if (req?.tabId !== undefined && typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:goForward request')
    }
    const tabId = req?.tabId ?? getMgr().findTabIdByWebContents(event.sender) ?? undefined
    const success = tabManagerForTab(tabId).goForward(tabId)
    return { success }
  })

  ipcMain.handle(
    IPC_CHANNELS.TABS_REORDER,
    (_event, req: TabsReorderRequest): TabsReorderResponse => {
      if (!req || !Array.isArray(req.ids) || !req.ids.every((id) => typeof id === 'string')) {
        throw new Error('Invalid tabs:reorder request: ids must be string array')
      }
      const tm = getMgr().getTabManager()
      return { success: tm.reorderTabs(req.ids) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TABS_SHOW_CONTEXT_MENU,
    (_event, req: TabsShowContextMenuRequest): TabsShowContextMenuResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid tabs:showContextMenu request: tabId required')
      }
      const mgr = getMgr()
      const tm = mgr.getTabManager()
      const tabs = tm.getAllTabs()
      const target = tabs.find((t) => t.id === req.tabId)
      if (!target) return { success: false }

      const index = tabs.findIndex((t) => t.id === req.tabId)

      const menu = buildTabContextMenu({
        window: mgr.getWindow(),
        tabId: target.id,
        tabUrl: target.url,
        canCloseOthers: tabs.length > 1,
        canCloseRight: index < tabs.length - 1,
        // 已弹出的标签在菜单里变成「收回主窗口」，再点一次就回来
        poppedOut: Boolean(target.poppedOut),
        // 已有独立窗口：可以直接并进去（菜单里列出「标题 · N 页」）
        popoutWindows: mgr.getPopoutManager().list(),
        onReload: (id) => tm.reloadTab(id),
        onClose: (id) => tm.closeTab(id),
        onCloseOthers: (id) => tm.closeOtherTabs(id),
        onCloseRight: (id) => tm.closeTabsToTheRight(id),
        onPopout: (id) => mgr.getPopoutManager().open(id),
        onPopoutTo: (id, windowId) => mgr.getPopoutManager().addTabToWindow(windowId, id),
        onReturnToMain: (id) => mgr.getPopoutManager().close(id),
      })
      menu.popup({ window: mgr.getWindow() })

      return { success: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.TABS_NAVIGATE, (event, req: TabsNavigateRequest): TabsNavigateResponse => {
    if (!req || typeof req.url !== 'string') {
      throw new Error('Invalid tabs:navigate request: url required')
    }
    if (req.tabId !== undefined && typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:navigate request: tabId must be string')
    }
    // 关键：不带 tabId 的导航（导航首页搜索框 / 书签卡片 / 自选股链接）
    // 必须作用在「发起请求的那个标签页」上 —— 独立窗口里发起的导航要留在独立窗口，
    // 否则用户在独立窗口里打开网站，页面会跑到主窗口去。
    const tabId = req.tabId ?? getMgr().findTabIdByWebContents(event.sender) ?? undefined
    const success = tabManagerForTab(tabId).navigate(req.url, tabId)
    return { success }
  })

  // ---------- 独立窗口（标签页弹出为独立 OS 窗口，多屏各看各的） ----------

  ipcMain.handle(IPC_CHANNELS.TABS_POPOUT, (_event, req: TabsPopoutRequest): TabsPopoutResponse => {
    if (!req || typeof req.tabId !== 'string') {
      throw new Error('Invalid tabs:popout request: tabId required')
    }
    return getMgr().getPopoutManager().open(req.tabId)
  })

  // 主窗口自绘顶栏的「标签 / 助手 / 视图 / 帮助」菜单按钮：在按钮位置弹出对应子菜单。
  // 主窗口隐藏了原生标题栏（titleBarStyle: hidden），所以没有原生菜单栏，这里用自绘按钮 + 弹出应用菜单代替。
  ipcMain.handle(
    IPC_CHANNELS.APP_SHOW_MENU,
    (event, req: AppShowMenuRequest): AppShowMenuResponse => {
      if (!req || typeof req.menuId !== 'string') {
        throw new Error('Invalid app:showMenu request: menuId required')
      }
      const menu = Menu.getApplicationMenu()
      if (!menu) return { success: false }
      const target = menu.getMenuItemById(req.menuId)?.submenu ?? menu
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      target.popup({ window: win, x: Math.round(req.x), y: Math.round(req.y) })
      return { success: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.WINDOWS_GET_ALL, (): WindowsGetAllResponse => {
    return { windows: getMgr().getPopoutManager().list() }
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_FOCUS,
    (_event, req: WindowsFocusRequest): WindowsFocusResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid windows:focus request: tabId required')
      }
      return { success: getMgr().getPopoutManager().focus(req.tabId) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_CLOSE,
    (_event, req: WindowsCloseRequest): WindowsCloseResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid windows:close request: tabId required')
      }
      return { success: getMgr().getPopoutManager().close(req.tabId) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_CLOSE_ALL,
    (): WindowsCloseAllResponse => {
      return { closed: getMgr().getPopoutManager().closeAll() }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_SET_BOUNDS,
    (_event, req: WindowsSetBoundsRequest): WindowsSetBoundsResponse => {
      if (!req || typeof req.windowId !== 'string') {
        throw new Error('Invalid windows:setBounds request: windowId required')
      }
      getMgr()
        .getPopoutManager()
        .setViewBounds(req.windowId, { x: req.x, y: req.y, width: req.width, height: req.height })
      return { success: true }
    }
  )

  // ---------- 独立窗口内的标签栏（一个窗口可承载多页） ----------

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_GET_TABS,
    (_event, req: WindowsGetTabsRequest): WindowsGetTabsResponse => {
      if (!req || typeof req.windowId !== 'string') {
        throw new Error('Invalid windows:getTabs request: windowId required')
      }
      const { tabs, activeTabId } = getMgr().getPopoutManager().listTabs(req.windowId)
      return { windowId: req.windowId, tabs, activeTabId }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_NEW_TAB,
    (_event, req: WindowsNewTabRequest): WindowsNewTabResponse => {
      if (!req || typeof req.windowId !== 'string') {
        throw new Error('Invalid windows:newTab request: windowId required')
      }
      if (req.url !== undefined && typeof req.url !== 'string') {
        throw new Error('Invalid windows:newTab request: url must be string')
      }
      const mgr = getMgr()
      const tabId = mgr.newTabInPopoutWindow(req.windowId, req.url)
      if (!tabId) throw new Error('该独立窗口已关闭')
      return { tabId }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_SWITCH_TAB,
    (_event, req: WindowsSwitchTabRequest): WindowsSwitchTabResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid windows:switchTab request: tabId required')
      }
      return { success: getMgr().getPopoutManager().switchTab(req.tabId) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_CLOSE_TAB,
    (_event, req: WindowsCloseTabRequest): WindowsCloseTabResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid windows:closeTab request: tabId required')
      }
      const mgr = getMgr()
      const popout = mgr.getPopoutManager()
      const windowId = popout.windowIdOf(req.tabId)
      if (!windowId) return { success: false }
      // 窗口里只剩这一页：收回整个窗口，标签回到主窗口标签栏
      if (popout.listTabs(windowId).tabs.length <= 1) {
        return { success: popout.close(req.tabId) }
      }
      // 还有其它页：真正关掉这一页（销毁 WebContents，窗口保留）
      // 关闭流程里的 onBeforeTabClosed 会把它从窗口摘下来
      return { success: tabManagerForTab(req.tabId).closeTab(req.tabId).success }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOWS_RETURN_TAB,
    (_event, req: WindowsReturnTabRequest): WindowsReturnTabResponse => {
      if (!req || typeof req.tabId !== 'string') {
        throw new Error('Invalid windows:returnTab request: tabId required')
      }
      // 把这一页送回主窗口标签栏；是窗口最后一页时等价于收回整个窗口
      return { success: getMgr().getPopoutManager().returnTabToMain(req.tabId) }
    }
  )

  // ---------- Bookmarks (async - 数据库操作) ----------

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_GET_ALL,
    async (): Promise<BookmarksGetAllResponse> => {
      const db = await getDb()
      return { bookmarks: getAllBookmarks(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_ADD,
    async (_event, req: BookmarksAddRequest): Promise<BookmarksAddResponse> => {
      if (!req || typeof req.title !== 'string' || typeof req.url !== 'string') {
        throw new Error('Invalid bookmarks:add request: title and url required')
      }
      const db = await getDb()
      const bookmark = addBookmark(db, {
        title: req.title,
        url: req.url,
        group_id: typeof req.group_id === 'number' ? req.group_id : 0,
      })
      return { bookmark }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_DELETE,
    async (_event, req: BookmarksDeleteRequest): Promise<BookmarksDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid bookmarks:delete request: id required')
      }
      const db = await getDb()
      const success = deleteBookmark(db, req.id)
      return { success }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_UPDATE,
    async (_event, req: BookmarksUpdateRequest): Promise<BookmarksUpdateResponse> => {
      if (
        !req ||
        typeof req.id !== 'number' ||
        typeof req.title !== 'string' ||
        typeof req.url !== 'string'
      ) {
        throw new Error('Invalid bookmarks:update request: id, title and url required')
      }
      if (!req.title.trim() || !req.url.trim()) {
        throw new Error('Invalid bookmarks:update request: title and url must not be empty')
      }
      const db = await getDb()
      const bookmark = updateBookmark(db, {
        id: req.id,
        title: req.title.trim(),
        url: req.url.trim(),
        group_id: typeof req.group_id === 'number' ? req.group_id : 0,
      })
      return { bookmark }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_REORDER,
    async (_event, req: BookmarksReorderRequest): Promise<BookmarksReorderResponse> => {
      if (!req || !Array.isArray(req.ids) || !req.ids.every((n) => typeof n === 'number')) {
        throw new Error('Invalid bookmarks:reorder request: ids must be number array')
      }
      const db = await getDb()
      reorderBookmarks(db, req.ids)
      return { success: true }
    }
  )

  // ---------- Bookmark groups (async - 数据库操作) ----------

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARK_GROUPS_GET,
    async (): Promise<BookmarkGroupsGetResponse> => {
      const db = await getDb()
      return { groups: getBookmarkGroups(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARK_GROUPS_CREATE,
    async (_event, req: BookmarkGroupsCreateRequest): Promise<BookmarkGroupsCreateResponse> => {
      if (!req || typeof req.name !== 'string' || !req.name.trim()) {
        throw new Error('分组名称不能为空')
      }
      const db = await getDb()
      const group = createBookmarkGroup(db, req.name.trim())
      return { group }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARK_GROUPS_UPDATE,
    async (_event, req: BookmarkGroupsUpdateRequest): Promise<BookmarkGroupsUpdateResponse> => {
      if (!req || typeof req.id !== 'number' || typeof req.name !== 'string' || !req.name.trim()) {
        throw new Error('Invalid bookmarkGroups:update request: id and name required')
      }
      const db = await getDb()
      const group = updateBookmarkGroup(db, { id: req.id, name: req.name.trim() })
      return { group }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARK_GROUPS_DELETE,
    async (_event, req: BookmarkGroupsDeleteRequest): Promise<BookmarkGroupsDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid bookmarkGroups:delete request: id required')
      }
      const db = await getDb()
      deleteBookmarkGroup(db, req.id)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_SET_GROUP,
    async (_event, req: BookmarksSetGroupRequest): Promise<BookmarksSetGroupResponse> => {
      if (!req || typeof req.id !== 'number' || typeof req.groupId !== 'number') {
        throw new Error('Invalid bookmarks:setGroup request: id and groupId required')
      }
      const db = await getDb()
      setBookmarkGroup(db, req.id, req.groupId)
      return { success: true }
    }
  )

  // ---------- Watchlist (async) ----------

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_GET_ALL,
    async (): Promise<WatchlistGetAllResponse> => {
      const db = await getDb()
      return { items: getAllWatchlist(db) }
    }
  )

  // 自选股任何写操作后广播最新列表与分组（主页 / 侧栏 / 行情回放等多处 UI 保持同步）
  const broadcastWatchlist = async (): Promise<void> => {
    const db = await getDb()
    const payload = { items: getAllWatchlist(db), groups: getGroups(db) }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WATCHLIST_UPDATED, payload)
    }
  }

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_ADD,
    async (_event, req: WatchlistAddRequest): Promise<WatchlistAddResponse> => {
      if (!req || typeof req.symbol !== 'string' || typeof req.name !== 'string') {
        throw new Error('Invalid watchlist:add request: symbol and name required')
      }
      const db = await getDb()
      const item = addToWatchlist(db, {
        symbol: normalizeSymbol(req.symbol),
        name: req.name,
        groupId: typeof req.groupId === 'number' ? req.groupId : 0,
      })
      // 添加后触发一次行情刷新
      getQuoteMgr().refresh().catch(() => {
        // 静默失败，下次轮询会更新
      })
      void broadcastWatchlist()
      return { item }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_REMOVE,
    async (_event, req: WatchlistRemoveRequest): Promise<WatchlistRemoveResponse> => {
      if (!req || typeof req.symbol !== 'string') {
        throw new Error('Invalid watchlist:remove request: symbol required')
      }
      const db = await getDb()
      const success = removeFromWatchlist(db, req.symbol)
      if (success) void broadcastWatchlist()
      return { success }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_REORDER,
    async (_event, req: WatchlistReorderRequest): Promise<WatchlistReorderResponse> => {
      if (!req || !Array.isArray(req.symbols) || !req.symbols.every((s) => typeof s === 'string')) {
        throw new Error('Invalid watchlist:reorder request: symbols must be string array')
      }
      const db = await getDb()
      reorderWatchlist(db, req.symbols)
      void broadcastWatchlist()
      return { success: true }
    }
  )

  // ===== 自选股分组 =====
  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_GROUPS_GET,
    async (_event, _req: WatchlistGroupsGetRequest): Promise<WatchlistGroupsGetResponse> => {
      const db = await getDb()
      seedSmartGroups(db)
      return { groups: getGroups(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_GROUP_CREATE,
    async (_event, req: WatchlistGroupCreateRequest): Promise<WatchlistGroupCreateResponse> => {
      if (!req || typeof req.name !== 'string' || !req.name.trim()) {
        throw new Error('Invalid watchlist:group:create request: name required')
      }
      const db = await getDb()
      const group = createGroup(db, req.name.trim())
      void broadcastWatchlist()
      return { group }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_GROUP_UPDATE,
    async (_event, req: WatchlistGroupUpdateRequest): Promise<WatchlistGroupUpdateResponse> => {
      if (!req || typeof req.id !== 'number' || typeof req.name !== 'string' || !req.name.trim()) {
        throw new Error('Invalid watchlist:group:update request: id and name required')
      }
      const db = await getDb()
      const group = updateGroup(db, req.id, req.name.trim())
      if (!group) throw new Error('分组不存在或不可修改')
      void broadcastWatchlist()
      return { group }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_GROUP_DELETE,
    async (_event, req: WatchlistGroupDeleteRequest): Promise<WatchlistGroupDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid watchlist:group:delete request: id required')
      }
      const db = await getDb()
      deleteGroup(db, req.id)
      void broadcastWatchlist()
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_SET_GROUP,
    async (_event, req: WatchlistSetGroupRequest): Promise<WatchlistSetGroupResponse> => {
      if (!req || typeof req.symbol !== 'string' || typeof req.groupId !== 'number') {
        throw new Error('Invalid watchlist:setGroup request: symbol and groupId required')
      }
      const db = await getDb()
      setWatchlistGroup(db, req.symbol, req.groupId)
      void broadcastWatchlist()
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_UPDATE,
    async (_event, req: WatchlistUpdateRequest): Promise<WatchlistUpdateResponse> => {
      if (!req || typeof req.symbol !== 'string' || typeof req.name !== 'string') {
        throw new Error('Invalid watchlist:update request: symbol and name required')
      }
      const name = req.name.trim()
      if (!name) {
        throw new Error('名称不能为空')
      }
      const db = await getDb()
      const item = renameWatchlistItem(db, req.symbol, name)
      void broadcastWatchlist()
      return { item }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WATCHLIST_SEARCH,
    async (_event, req: WatchlistSearchRequest): Promise<WatchlistSearchResponse> => {
      if (!req || typeof req.keyword !== 'string') {
        throw new Error('Invalid watchlist:search request: keyword required')
      }
      const provider = getQuoteProvider()
      const results = await provider.searchSymbol(req.keyword)
      return { results }
    }
  )

  // ---------- Quotes ----------

  ipcMain.handle(
    IPC_CHANNELS.QUOTES_GET_LATEST,
    (): QuotesGetLatestResponse => {
      const mgr = getQuoteMgr()
      return mgr.getLatestQuotes()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.QUOTES_REFRESH,
    async (_event, _req: QuotesRefreshRequest): Promise<QuotesRefreshResponse> => {
      const mgr = getQuoteMgr()
      await mgr.refresh()
      return { success: true }
    }
  )

  // ---------- 行情数据源配置 ----------

  ipcMain.handle(IPC_CHANNELS.QUOTE_GET_SOURCE, (): QuoteSourceInfo => {
    const cfg = getConfig().quote
    // 实际生效的源：连续失败自动降级后与用户选的不同，界面要能看出来
    let active: string | undefined
    let degraded: boolean | undefined
    try {
      const src = getQuoteMgr().getSource()
      active = src.active
      degraded = src.degraded
    } catch {
      // 轮询器还没初始化（理论不会）：只返回配置值
    }
    return {
      provider: cfg.provider || 'eastmoney',
      custom: cfg.custom
        ? {
            quoteUrl: cfg.custom.quoteUrl || '',
            klineUrl: cfg.custom.klineUrl,
            quoteArrayPath: cfg.custom.quoteArrayPath,
            fieldMap: cfg.custom.fieldMap || {},
            headers: cfg.custom.headers,
          }
        : undefined,
      active,
      degraded,
    }
  })

  ipcMain.handle(IPC_CHANNELS.QUOTE_SET_SOURCE, (_event, req: QuoteSourceInfo) => {
    if (!req || typeof req.provider !== 'string') {
      throw new Error('Invalid quote:setSource request: provider required')
    }
    const valid = ['eastmoney', 'tencent', 'custom']
    const provider = valid.includes(req.provider) ? req.provider : 'eastmoney'
    const custom =
      provider === 'custom' && req.custom
        ? {
            quoteUrl: req.custom.quoteUrl || '',
            klineUrl: req.custom.klineUrl,
            quoteArrayPath: req.custom.quoteArrayPath,
            fieldMap: (req.custom.fieldMap || {}) as CustomQuoteConfig['fieldMap'],
            headers: req.custom.headers,
          }
        : undefined
    updateConfig({ quote: { ...getConfig().quote, provider, custom } })
    // 运行时切换：立即用新源拉一次，用户马上看到是否可用
    const newProvider = createQuoteProvider(provider, custom)
    getQuoteMgr().setProvider(newProvider)
    return { ok: true }
  })

  // 测试连接：用固定代码拉一次，返回样例与耗时（不写入配置）
  ipcMain.handle(
    IPC_CHANNELS.QUOTE_TEST_SOURCE,
    async (_event, req: QuoteSourceTestRequest): Promise<QuoteSourceTestResponse> => {
      const started = Date.now()
      try {
        if (!req || typeof req.provider !== 'string') {
          throw new Error('provider required')
        }
        const provider = createQuoteProvider(
          req.provider,
          req.custom as CustomQuoteConfig | undefined
        )
        const quotes = await provider.getQuotes(['600519.SH'])
        if (quotes.length === 0) throw new Error('未返回行情数据')
        const q = quotes[0]
        return {
          ok: true,
          sample: {
            symbol: q.symbol,
            name: q.name,
            price: q.price,
            changePercent: q.changePercent,
          },
          latencyMs: Date.now() - started,
        }
      } catch (err: any) {
        return {
          ok: false,
          error: err?.message || String(err),
          latencyMs: Date.now() - started,
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.QUOTE_HISTORY_GET,
    async (_event, req: QuoteHistoryGetRequest): Promise<QuoteHistoryGetResponse> => {
      if (!req || typeof req.symbol !== 'string' || typeof req.fromTs !== 'number') {
        throw new Error('Invalid quoteHistory:get request: symbol and fromTs required')
      }
      const db = await getDb()
      const history = getQuoteHistory(db, req.symbol, req.fromTs, req.toTs)
      return { history }
    }
  )

  // ---------- Window ----------

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_SET_WEB_AREA_BOUNDS,
    (_event, req: WindowSetWebAreaBoundsRequest): WindowSetWebAreaBoundsResponse => {
      if (!req || typeof req !== 'object') {
        throw new Error('Invalid window:setWebAreaBounds request: bounds required')
      }
      getMgr().setWebAreaBounds(req)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
    async (_event, _req: WindowToggleFullscreenRequest): Promise<WindowToggleFullscreenResponse> => {
      const fullscreen = await getMgr().toggleFullscreen()
      return { fullscreen }
    }
  )

  // 主题切换：记住当前主题、同步原生窗口控制按钮配色，并广播给所有 webContents。
  // 必须广播：各空间标签用独立 session partition，localStorage 互不相通，
  // 渲染端之间的 storage 事件跨不过分区，只能靠主进程中转（含 WebContentsView）。
  ipcMain.handle(IPC_CHANNELS.THEME_SET, (_event, req: ThemeSetRequest): void => {
    if (req?.mode !== 'dark' && req?.mode !== 'light') {
      throw new Error(`invalid theme mode: ${String(req?.mode)}`)
    }
    getMgr().setTheme(req.mode)
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) wc.send(IPC_CHANNELS.THEME_UPDATED, { mode: req.mode })
    }
  })

  // 查询当前主题：新挂载的页面（WebContentsView）本地无偏好时以此对齐
  ipcMain.handle(IPC_CHANNELS.THEME_GET, (): ThemeGetResponse => {
    return { mode: getMgr().getTheme() }
  })

  // ---------- App Log (运行日志) ----------

  ipcMain.handle(
    IPC_CHANNELS.APP_LOG_TAIL,
    (_event, req: AppLogTailRequest): AppLogTailResponse => {
      const lines = typeof req?.lines === 'number' ? Math.min(Math.max(req.lines, 1), 2000) : 200
      return { path: getTodayLogFile(), content: tailLogLines(lines) }
    }
  )

  ipcMain.handle(IPC_CHANNELS.APP_LOG_OPEN_DIR, (_event, _req: AppLogOpenDirRequest): void => {
    openLogDir()
  })

  // ---------- Page Visits (浏览轨迹) ----------

  ipcMain.handle(
    IPC_CHANNELS.PAGE_VISITS_GET_SUMMARY,
    async (_event, req: PageVisitsGetSummaryRequest): Promise<PageVisitsGetSummaryResponse> => {
      const db = await getDb()
      const date = req?.date ? new Date(req.date) : new Date()
      const space = typeof req?.space === 'string' && req.space ? req.space : undefined
      const summaries = getTodayStockSummary(db, date, space)
      return { summaries }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PAGE_VISITS_GET_BY_STOCK,
    async (_event, req: PageVisitsGetByStockRequest): Promise<PageVisitsGetByStockResponse> => {
      if (!req || typeof req.symbol !== 'string') {
        throw new Error('Invalid pageVisits:getByStock request: symbol required')
      }
      const db = await getDb()
      const date = req.date ? new Date(req.date) : new Date()
      const space = typeof req.space === 'string' && req.space ? req.space : undefined
      const visits = getVisitsByStockAndDate(db, req.symbol, date, space)
      return { visits }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PAGE_VISITS_EXPORT,
    async (_event, req: PageVisitsExportRequest): Promise<PageVisitsExportResponse> => {
      const db = await getDb()
      const date = req?.date ? new Date(req.date) : new Date()
      const space = typeof req?.space === 'string' && req.space ? req.space : undefined
      const visits = getVisitsByDate(db, date, space)

      if (visits.length === 0) {
        return { success: false, count: 0 }
      }

      const headers = ['访问时间', '空间', '股票代码', '标题', 'URL', '停留(秒)']
      const rows = visits.map((v) => [
        new Date(v.started_at).toLocaleString('zh-CN'),
        v.space,
        v.symbol ?? '',
        v.title ?? '',
        v.url,
        Math.round(v.duration_ms / 1000),
      ])
      const csv = toCsv(headers, rows)

      const pad = (n: number) => String(n).padStart(2, '0')
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const spaceStr = space ? `-${space}` : ''
      const defaultPath = `浏览轨迹-${dateStr}${spaceStr}.csv`

      const result = await dialog.showSaveDialog(getMgr().getWindow(), {
        title: '导出浏览轨迹',
        defaultPath,
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      })

      if (result.canceled || !result.filePath) {
        return { success: false, count: visits.length }
      }

      writeFileSync(result.filePath, csv, 'utf8')
      return { success: true, path: result.filePath, count: visits.length }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PAGE_VISITS_DELETE,
    async (_event, req: PageVisitsDeleteRequest): Promise<PageVisitsDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid pageVisits:delete request: id required')
      }
      const db = await getDb()
      return { success: deleteVisit(db, req.id) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PAGE_VISITS_CLEAR_ALL,
    async (_event, _req: PageVisitsClearAllRequest): Promise<PageVisitsClearAllResponse> => {
      const db = await getDb()
      clearAllVisits(db)
      return { success: true }
    }
  )

  // ---------- Settings (设置) ----------

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_TRACKING_ENABLED,
    async (): Promise<SettingsGetTrackingEnabledResponse> => {
      const db = await getDb()
      return { enabled: isTrackingEnabled(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_TRACKING_ENABLED,
    async (_event, req: SettingsSetTrackingEnabledRequest): Promise<SettingsSetTrackingEnabledResponse> => {
      if (!req || typeof req.enabled !== 'boolean') {
        throw new Error('Invalid settings:setTrackingEnabled request: enabled required')
      }
      const db = await getDb()
      setTrackingEnabled(db, req.enabled)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_SESSION_RESTORE,
    async (): Promise<SettingsGetSessionRestoreResponse> => {
      const db = await getDb()
      return { enabled: isSessionRestoreEnabled(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_SESSION_RESTORE,
    async (
      _event,
      req: SettingsSetSessionRestoreRequest
    ): Promise<SettingsSetSessionRestoreResponse> => {
      if (!req || typeof req.enabled !== 'boolean') {
        throw new Error('Invalid settings:setSessionRestore request: enabled required')
      }
      const db = await getDb()
      setSessionRestoreEnabled(db, req.enabled)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BLACKLIST,
    async (): Promise<SettingsGetBlacklistResponse> => {
      const db = await getDb()
      return { domains: getDomainBlacklist(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_BLACKLIST,
    async (_event, req: SettingsSetBlacklistRequest): Promise<SettingsSetBlacklistResponse> => {
      if (!req || !Array.isArray(req.domains) || !req.domains.every((d) => typeof d === 'string')) {
        throw new Error('Invalid settings:setBlacklist request: domains must be string array')
      }
      const db = await getDb()
      setDomainBlacklist(db, req.domains)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_SEARCH_ENGINE,
    async (): Promise<SettingsGetSearchEngineResponse> => {
      const db = await getDb()
      return { template: getSearchEngineTemplate(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_SEARCH_ENGINE,
    async (_event, req: SettingsSetSearchEngineRequest): Promise<SettingsSetSearchEngineResponse> => {
      if (!req || typeof req.template !== 'string' || !req.template.includes('%s')) {
        throw new Error('Invalid settings:setSearchEngine request: template with %s required')
      }
      const db = await getDb()
      setSearchEngineTemplate(db, req.template)
      return { success: true }
    }
  )

  // ---------- 行情轮询频率（存 config.json，改完立即应用到轮询器） ----------

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_QUOTE_INTERVAL,
    (): SettingsGetQuoteIntervalResponse => {
      const { tradingIntervalMs, nonTradingIntervalMs } = getConfig().quote
      return { tradingIntervalMs, nonTradingIntervalMs }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_QUOTE_INTERVAL,
    (_event, req: SettingsSetQuoteIntervalRequest): SettingsSetQuoteIntervalResponse => {
      const current = getConfig().quote
      const next = {
        tradingIntervalMs: req?.tradingIntervalMs ?? current.tradingIntervalMs,
        nonTradingIntervalMs: req?.nonTradingIntervalMs ?? current.nonTradingIntervalMs,
      }
      for (const [key, value] of Object.entries(next)) {
        if (!Number.isFinite(value) || value < 1000 || value > 600000) {
          throw new Error(`${key} 必须在 1000 ~ 600000 毫秒之间（1 秒 ~ 10 分钟）`)
        }
      }
      updateConfig({ quote: { ...current, ...next } })
      // 立即生效：重排下一次轮询，不必重启应用
      getQuoteMgr().updateConfig(next)
      return next
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_TRADING_CALENDAR,
    async (): Promise<SettingsGetTradingCalendarResponse> => {
      const db = await getDb()
      return { config: getTradingCalendar(db), defaultConfig: DEFAULT_CALENDAR }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_TRADING_CALENDAR,
    async (_event, req: SettingsSetTradingCalendarRequest): Promise<SettingsSetTradingCalendarResponse> => {
      if (
        !req ||
        !req.config ||
        !Array.isArray(req.config.holidays) ||
        !req.config.holidays.every((d) => typeof d === 'string') ||
        !Array.isArray(req.config.makeupWorkdays) ||
        !req.config.makeupWorkdays.every((d) => typeof d === 'string')
      ) {
        throw new Error('Invalid settings:setTradingCalendar request: config must have holidays/makeupWorkdays string arrays')
      }
      const db = await getDb()
      setTradingCalendar(db, req.config)
      const mgr = getQuoteMgr()
      if (mgr && typeof mgr.reloadCalendar === 'function') {
        mgr.reloadCalendar()
      }
      return { success: true }
    }
  )

  // ---------- 交易记录 ----------

  ipcMain.handle(
    IPC_CHANNELS.TRADES_GET_ALL,
    async (_event, req: TradesGetAllRequest): Promise<TradesGetAllResponse> => {
      if (req?.limit !== undefined && typeof req.limit !== 'number') {
        throw new Error('Invalid trades:getAll request')
      }
      const db = await getDb()
      const trades = getTrades(db, req?.limit ?? 200)
      return {
        items: trades.map((trade) => ({
          trade,
          review: getReviewNote(db, trade.id),
        })),
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TRADES_ADD,
    async (_event, req: TradesAddRequest): Promise<TradesAddResponse> => {
      if (
        !req ||
        typeof req.symbol !== 'string' ||
        typeof req.name !== 'string' ||
        (req.side !== 'buy' && req.side !== 'sell') ||
        typeof req.price !== 'number' ||
        typeof req.quantity !== 'number' ||
        typeof req.traded_at !== 'number'
      ) {
        throw new Error('Invalid trades:add request: 请填写代码、名称、方向、价格、数量、时间')
      }
      if (!Number.isFinite(req.price) || req.price <= 0) {
        throw new Error('价格必须是正数')
      }
      if (!Number.isInteger(req.quantity) || req.quantity <= 0) {
        throw new Error('数量必须是正整数')
      }

      const db = await getDb()
      const trade = addTrade(db, {
        symbol: req.symbol.trim(),
        name: req.name.trim(),
        side: req.side,
        price: req.price,
        quantity: req.quantity,
        traded_at: req.traded_at,
        fee: typeof req.fee === 'number' ? req.fee : 0,
        source: req.source || 'manual',
        confirmed: 1,
        buy_reason: req.buy_reason?.trim() || null,
        sell_reason: req.sell_reason?.trim() || null,
      })
      return { trade }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TRADES_UPDATE,
    async (_event, req: TradesUpdateRequest): Promise<TradesUpdateResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid trades:update request: id required')
      }
      if (req.side !== undefined && req.side !== 'buy' && req.side !== 'sell') {
        throw new Error('Invalid trades:update request: side must be buy or sell')
      }
      if (req.price !== undefined && (!Number.isFinite(req.price) || req.price <= 0)) {
        throw new Error('价格必须是正数')
      }
      if (req.quantity !== undefined && (!Number.isInteger(req.quantity) || req.quantity <= 0)) {
        throw new Error('数量必须是正整数')
      }

      // 未传(undefined)表示不改；显式 null / 空白串表示清空理由
      const normReason = (v?: string | null) =>
        v === undefined ? undefined : v === null ? null : v.trim() || null

      const db = await getDb()
      const trade = updateTrade(db, req.id, {
        symbol: req.symbol?.trim(),
        name: req.name?.trim(),
        side: req.side,
        price: req.price,
        quantity: req.quantity,
        traded_at: req.traded_at,
        fee: req.fee,
        source: req.source,
        buy_reason: normReason(req.buy_reason),
        sell_reason: normReason(req.sell_reason),
      })
      return { trade }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TRADES_DELETE,
    async (_event, req: TradesDeleteRequest): Promise<TradesDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid trades:delete request: id required')
      }
      const db = await getDb()
      return { success: deleteTrade(db, req.id) }
    }
  )

  // 解析券商交割单文本（启发式优先，失败则用大模型兜底）
  ipcMain.handle(
    IPC_CHANNELS.TRADES_IMPORT_PARSE,
    async (_event, req: TradesImportParseRequest): Promise<TradesImportParseResponse> => {
      if (!req || typeof req.text !== 'string' || !req.text.trim()) {
        throw new Error('请提供交割单文本（CSV 或粘贴的网页内容）')
      }
      let result = parseBrokerStatement(req.text)
      if (result.trades.length === 0) {
        try {
          const cfg = getConfig()
          if (cfg.llm.apiKey) {
            const client = new LLMClient({
              baseUrl: cfg.llm.baseUrl,
              apiKey: cfg.llm.apiKey,
              model: cfg.llm.model,
            })
            const llmTrades = await parseBrokerStatementWithLLM(req.text, client)
            if (llmTrades.length > 0) {
              result = { trades: llmTrades, method: 'llm', unmatched: [], warnings: [] }
            }
          }
        } catch (err) {
          result.warnings.push('大模型解析失败：' + (err instanceof Error ? err.message : String(err)))
        }
      }
      return result
    }
  )

  // 批量写入解析后的成交（按唯一约束自动去重）
  ipcMain.handle(
    IPC_CHANNELS.TRADES_IMPORT_BULK,
    async (_event, req: TradesImportBulkRequest): Promise<TradesImportBulkResponse> => {
      if (!req || !Array.isArray(req.trades) || req.trades.length === 0) {
        throw new Error('没有可导入的成交记录')
      }
      const db = await getDb()
      // 来源：交割单导入（默认）/ 自然语言录入（AI 辅助，但仍属用户手工确认的记录）
      const source = req.source === 'manual' ? 'manual' : 'broker_import'
      let inserted = 0
      let skipped = 0
      const errors: string[] = []
      for (const t of req.trades) {
        try {
          const trade = addTrade(db, {
            symbol: t.symbol,
            name: t.name || t.symbol,
            side: t.side,
            price: t.price,
            quantity: t.quantity,
            traded_at: t.tradedAt,
            fee: t.fee || 0,
            source,
            confirmed: 1,
            buy_reason: null,
            sell_reason: null,
          })
          if (trade) inserted++
          else skipped++
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err))
        }
      }
      return { inserted, skipped, errors }
    }
  )

  // 自然语言录入：大模型把大白话解析为成交记录（结果仍走预览确认，不直接入库）
  ipcMain.handle(
    IPC_CHANNELS.TRADES_PARSE_NATURAL,
    async (_event, req: TradesParseNaturalRequest): Promise<TradesParseNaturalResponse> => {
      if (!req || typeof req.text !== 'string' || !req.text.trim()) {
        throw new Error('请先输入交易描述')
      }
      const cfg = getConfig()
      if (!cfg.llm.apiKey) {
        throw new Error('API Key 未配置，请在设置中填写')
      }
      const client = new LLMClient({
        baseUrl: cfg.llm.baseUrl,
        apiKey: cfg.llm.apiKey,
        model: cfg.llm.model,
      })
      const warnings: string[] = []
      let trades: ParsedTrade[] = []
      try {
        const data = await client.completeJson(
          naturalTradeSystemPrompt(),
          naturalTradeUserPrompt(req.text, new Date())
        )
        trades = sanitizeNaturalTrades(data)
      } catch (err) {
        throw new Error('解析失败：' + (err instanceof Error ? err.message : String(err)))
      }
      if (trades.length === 0) {
        warnings.push('未能从描述中识别出有效的成交记录，请补充代码/方向/价格/数量等要素')
      }
      return { trades, warnings }
    }
  )

  // 复盘闭环：成交前 N 天、同一股票的研究记录（浏览轨迹 + AI 分析）
  ipcMain.handle(
    IPC_CHANNELS.TRADES_GET_CONTEXT,
    async (_event, req: TradesGetContextRequest): Promise<TradesGetContextResponse> => {
      if (!req || typeof req.symbol !== 'string' || typeof req.tradedAt !== 'number') {
        throw new Error('Invalid trades:getContext request: symbol and tradedAt required')
      }
      const db = await getDb()
      const symbol = normalizeSymbol(req.symbol)
      const hours = typeof req.hours === 'number' ? req.hours : 72
      const from = req.tradedAt - Math.min(Math.max(hours, 1), 720) * 3600 * 1000
      const to = req.tradedAt + AFTER_WINDOW_MS
      const ctx = selectDecisionContext({
        visits: getVisitsBySymbolAndRange(db, symbol, from, to),
        analyses: getAnalysesBySymbolAndRange(db, symbol, from, to).map((a) => ({
          id: a.id,
          url: a.url,
          symbol: a.symbol,
          page_type: a.page_type,
          created_at: a.created_at,
          summary: extractSummary(a.result_json),
        })),
        symbol,
        tradedAt: req.tradedAt,
        hours,
      })
      return {
        visits: ctx.visits,
        analyses: ctx.analyses,
        totalResearchMs: ctx.totalResearchMs,
        windowFrom: ctx.windowFrom,
        windowTo: ctx.windowTo,
      }
    }
  )

  // ---------- 复盘笔记（读取随 trades:getAll 一并返回，这里只需写入） ----------

  ipcMain.handle(
    IPC_CHANNELS.REVIEWS_SAVE,
    async (_event, req: ReviewsSaveRequest): Promise<ReviewsSaveResponse> => {
      if (!req || typeof req.tradeId !== 'number') {
        throw new Error('Invalid reviews:save request: tradeId required')
      }
      if (
        req.was_reason_valid !== undefined &&
        req.was_reason_valid !== null &&
        req.was_reason_valid !== 0 &&
        req.was_reason_valid !== 1
      ) {
        throw new Error('Invalid reviews:save request: was_reason_valid must be 0 or 1')
      }

      const db = await getDb()
      if (!getTradeById(db, req.tradeId)) {
        throw new Error('交易记录不存在，无法保存复盘')
      }

      const review = saveReviewNote(db, {
        trade_id: req.tradeId,
        was_reason_valid: req.was_reason_valid ?? null,
        did_well: req.did_well ?? null,
        did_wrong: req.did_wrong ?? null,
        next_time: req.next_time ?? null,
      })
      return { review }
    }
  )

  // 只删笔记、保留交易（此前想清掉笔记只能连交易一起删）
  ipcMain.handle(
    IPC_CHANNELS.REVIEWS_DELETE,
    async (_event, req: ReviewsDeleteRequest): Promise<ReviewsDeleteResponse> => {
      if (!req || typeof req.tradeId !== 'number') {
        throw new Error('Invalid reviews:delete request: tradeId required')
      }
      const db = await getDb()
      return { success: deleteReviewNote(db, req.tradeId) }
    }
  )

  // ---------- AI 页面分析 ----------

  ipcMain.handle(
    IPC_CHANNELS.AI_ANALYZE_PAGE,
    async (_event, req: AiAnalyzePageRequest): Promise<AiAnalyzePageResponse> => {
      if (req && req.tabId !== undefined && typeof req.tabId !== 'string') {
        throw new Error('Invalid ai:analyzePage request: tabId must be string')
      }
      const wc = getMgr().getTabManager().getWebContents(req?.tabId)
      if (!wc) {
        throw new Error('当前没有可分析的页面')
      }
      const result = await aiService.analyzeWebContents(wc)
      return { result }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_ANALYZE_TEXT,
    async (_event, req: AiAnalyzeTextRequest): Promise<AiAnalyzeTextResponse> => {
      if (!req || typeof req.text !== 'string') {
        throw new Error('Invalid ai:analyzeText request: text required')
      }
      if (req.text.length > 50000) {
        throw new Error('文本过长（上限 50000 字）')
      }
      const result = await aiService.analyzeText({
        text: req.text,
        title: req.title,
        url: req.url,
        symbol: req.symbol,
      })
      return { result }
    }
  )

  // 采集当前页面全部链接
  ipcMain.handle(
    IPC_CHANNELS.WEB_GET_LINKS,
    async (_event, req: WebGetLinksRequest): Promise<WebGetLinksResponse> => {
      const wc = getMgr().getTabManager().getWebContents(req?.tabId)
      if (!wc) {
        throw new Error('当前没有可采集链接的页面')
      }
      const raw = (await wc.executeJavaScript(
        `Array.from(document.querySelectorAll('a[href]')).map((a) => ({ text: (a.innerText||a.textContent||'').trim().slice(0,120), href: a.href })).filter((x) => x.href && x.href.startsWith('http'))`
      )) as { text: string; href: string }[]

      const seen = new Set<string>()
      const links = raw
        .filter((x) => {
          if (seen.has(x.href)) return false
          seen.add(x.href)
          return true
        })
        .map((x) => {
          const symbol = extractStockFromUrl(x.href) || extractStockFromText(x.text)[0] || null
          return {
            text: x.text || x.href,
            href: x.href,
            isStock: Boolean(symbol),
            symbol,
          } as WebLink
        })
        .slice(0, 500)

      return { links }
    }
  )

  // ===== LangChain 深度研究代理 =====
  let activeAgent: { abort: AbortController } | null = null

  /**
   * 广播 Agent 流式事件到**所有**窗口。
   *
   * 以前只发给主窗口，导致 AI 桌宠（独立浮窗）发起的对话收不到 delta，
   * 表现为「发出去没反应、助手气泡一直空着」。
   * 各监听端只有在自己发起会话时才消费（streamingId 为空直接忽略），
   * 所以广播不会让主窗口 Copilot 和桌宠互相串台。
   */
  function pushAgentEventToAll(evt: AgentEvent): void {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        if (!w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
          w.webContents.send(IPC_CHANNELS.AGENT_STREAM, evt)
        }
      } catch {
        /* 单个窗口发送失败不影响其它窗口 */
      }
    }
  }

  ipcMain.handle(
    IPC_CHANNELS.AGENT_RUN,
    async (_event, req: AgentRunRequest): Promise<{ ok: boolean }> => {
      const llm = getConfig().llm
      const agent = new DeepResearchAgent(
        {
          getWindow: () => getMgr().getWindow(),
          getActiveWebContents: () => getMgr().getTabManager().getWebContents(),
        },
        {
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          capabilities: getConfig().agent,
        }
      )

      const push = (evt: AgentEvent) => {
        pushAgentEventToAll(evt)
        // 报告产出即落库，避免关掉面板后成果丢失
        if (evt.type === 'done' && evt.report && evt.report !== '(未生成报告)') {
          ;(async () => {
            try {
              const db = await getDb()
              addReport(db, { query: req.query, mode: req.mode, report: evt.report })
            } catch (err) {
              console.error('[agent] Failed to save research report:', err)
            }
          })()
        }
      }

      const ac = new AbortController()
      activeAgent = { abort: ac }
      try {
        await agent.run(req.query, { mode: req.mode, currentUrl: req.currentUrl }, push, ac.signal)
      } catch (err: any) {
        push({ type: 'error', message: err?.message || String(err) })
      } finally {
        activeAgent = null
      }
      return { ok: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.AGENT_STOP, async (_event, _req: AgentStopRequest) => {
    activeAgent?.abort.abort()
    activeAgent = null
  })

  // ===== AI 助手 Copilot（多轮会话 + 内部数据工具 + 行动工具）=====
  let activeCopilot: { abort: AbortController } | null = null

  // 行动工具的用户确认：requestId → resolve(approved)
  const pendingConfirmations = new Map<string, (approved: boolean) => void>()
  const CONFIRM_TIMEOUT_MS = 120_000

  /** 请求用户确认一个写操作：推送 action_confirm 事件并等待用户点击（超时按取消处理） */
  const requestActionConfirmation = (tool: string, args: Record<string, unknown>): Promise<boolean> => {
    const requestId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const win = getMgr().getWindow()
    if (!win || win.isDestroyed()) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pendingConfirmations.delete(requestId)
        resolve(false)
      }, CONFIRM_TIMEOUT_MS)
      pendingConfirmations.set(requestId, (approved) => {
        clearTimeout(timer)
        resolve(approved)
      })
      win.webContents.send(IPC_CHANNELS.AGENT_STREAM, {
        type: 'action_confirm',
        requestId,
        tool,
        summary: summarizeAction(tool, args),
      } satisfies AgentEvent)
    })
  }

  ipcMain.handle(
    IPC_CHANNELS.AGENT_CONFIRM_ACTION,
    async (_event, req: AgentConfirmActionRequest): Promise<AgentConfirmActionResponse> => {
      if (!req || typeof req.requestId !== 'string') {
        throw new Error('Invalid agent:confirmAction request: requestId required')
      }
      const resolve = pendingConfirmations.get(req.requestId)
      if (!resolve) return { ok: false }
      pendingConfirmations.delete(req.requestId)
      resolve(req.approved === true)
      return { ok: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_CHAT,
    async (_event, req: AgentChatRequest): Promise<AgentChatResponse> => {
      if (!req || typeof req.message !== 'string' || !req.message.trim()) {
        throw new Error('Invalid agent:chat request: message required')
      }
      const llm = getConfig().llm
      const agent = new CopilotAgent(
        {
          getWindow: () => getMgr().getWindow(),
          getActiveWebContents: () => getMgr().getTabManager().getWebContents(),
          getDb,
          getLatestQuotes: () => getQuoteMgr().getLatestQuotes(),
          requestConfirmation: requestActionConfirmation,
          // 写操作副作用与 IPC 层保持同一套行为（刷新/广播/镜像/向量）
          afterWatchlistAdd: (symbol, name) => {
            getQuoteMgr().refresh().catch(() => {
              // 静默失败，下次轮询会更新
            })
            void broadcastWatchlist()
            console.log(`[copilot] 已加入自选股：${name}（${symbol}）`)
          },
          afterNoteSaved: (note) => {
            try {
              syncNoteToFile(note)
            } catch (err) {
              console.error('[notes-sync] Copilot 建笔记后同步文件失败：', err)
            }
            const text = `${note.title}\n${note.content}`.trim()
            if (text) {
              void (async () => {
                try {
                  const emb = await embedText(text)
                  setNoteEmbedding(await getDb(), note.id, emb)
                } catch (err) {
                  console.error('[kb] Copilot 建笔记向量更新失败（不影响保存）：', err)
                }
              })()
            }
            broadcastNotes({ note })
          },
        },
        {
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          fastModel: llm.fastModel,
          capabilities: getConfig().agent,
        }
      )

      const push = (evt: AgentEvent) => {
        pushAgentEventToAll(evt)
      }

      const ac = new AbortController()
      activeCopilot = { abort: ac }
      try {
        const { sessionId } = await agent.chat(
          {
            sessionId: typeof req.sessionId === 'number' ? req.sessionId : undefined,
            message: req.message,
            currentUrl: req.currentUrl,
            // 桌宠会把名字/人设带进来，让助手知道「我是谁」
            persona: typeof req.persona === 'string' ? req.persona : undefined,
          },
          push,
          ac.signal
        )
        return { ok: true, sessionId }
      } finally {
        activeCopilot = null
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.AGENT_CHAT_STOP, async () => {
    activeCopilot?.abort.abort()
    activeCopilot = null
  })

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSIONS_LIST,
    async (): Promise<AgentSessionsListResponse> => {
      const db = await getDb()
      return { sessions: listSessions(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_GET,
    async (_event, req: { sessionId: number }): Promise<AgentSessionGetResponse> => {
      if (!req || typeof req.sessionId !== 'number') {
        throw new Error('Invalid agent:sessionGet request: sessionId required')
      }
      const db = await getDb()
      const session = getSession(db, req.sessionId)
      if (!session) return { session: null }
      return {
        session: {
          id: session.id,
          title: session.title,
          created_at: session.created_at,
          updated_at: session.updated_at,
          messages: parseSessionMessages(session.messages_json),
        },
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_DELETE,
    async (_event, req: AgentSessionDeleteRequest): Promise<AgentSessionDeleteResponse> => {
      if (!req || typeof req.sessionId !== 'number') {
        throw new Error('Invalid agent:sessionDelete request: sessionId required')
      }
      const db = await getDb()
      return { success: deleteSession(db, req.sessionId) }
    }
  )

  // ===== 页面智能体：大模型自动控制当前打开的网页 =====
  let pageAgentAbort: AbortController | null = null

  ipcMain.handle(
    IPC_CHANNELS.PAGE_AGENT_START,
    async (_event, req: PageAgentStartRequest): Promise<PageAgentStartResponse> => {
      if (!req || typeof req.goal !== 'string' || !req.goal.trim()) {
        throw new Error('请提供操作目标（例如：在搜索框输入贵州茅台并搜索）')
      }
      const wc = getMgr().getTabManager().getWebContents(req.tabId)
      if (!wc || wc.isDestroyed()) {
        throw new Error('当前没有可控制的页面，请先打开一个标签页')
      }
      const llm = makeLlmClient()
      // 先停掉上一次未结束的运行
      pageAgentAbort?.abort()
      const ac = new AbortController()
      pageAgentAbort = ac
      const sender = _event.sender
      // 后台跑闭环，不阻塞本次响应
      runPageAgent({
        webContents: wc,
        llm,
        goal: req.goal.trim(),
        maxSteps: req.maxSteps ?? 10,
        signal: ac.signal,
        onEvent: (e: PageAgentEvent) => {
          if (sender && !sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.PAGE_AGENT_EVENT, e)
          }
        },
      }).catch((err) => {
        if (sender && !sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.PAGE_AGENT_EVENT, {
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
      return { started: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PAGE_AGENT_STOP,
    async (_event, _req: PageAgentStopRequest): Promise<PageAgentStopResponse> => {
      pageAgentAbort?.abort()
      pageAgentAbort = null
      return { stopped: true }
    }
  )

  // ===== AI 桌宠 =====

  ipcMain.handle(
    IPC_CHANNELS.PET_TOGGLE,
    (_event, req: PetToggleRequest): PetToggleResponse => {
      return { visible: togglePetWindow(req?.visible) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PET_SET_SIZE,
    (_event, req: PetSetSizeRequest): PetSetSizeResponse => {
      if (!req || typeof req.width !== 'number' || typeof req.height !== 'number') {
        throw new Error('Invalid pet:setSize request: width/height required')
      }
      return { ok: setPetSize(req.width, req.height) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PET_GET_CONFIG,
    (_event, _req: PetGetConfigRequest): PetGetConfigResponse => {
      const pet = getConfig().pet
      return { config: { name: pet.name, systemPrompt: pet.systemPrompt } }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PET_SET_CONFIG,
    (_event, req: PetSetConfigRequest): PetSetConfigResponse => {
      const current = getConfig().pet
      const systemPrompt = req?.restoreDefault
        ? DEFAULT_PET_SYSTEM_PROMPT
        : typeof req?.systemPrompt === 'string'
          ? req.systemPrompt
          : current.systemPrompt
      const next = {
        name: typeof req?.name === 'string' && req.name.trim() ? req.name.trim() : current.name,
        systemPrompt,
      }
      updateConfig({ pet: next })
      return { config: next }
    }
  )

  /**
   * 让桌宠弹提示气泡（行情监控 / 策略信号等场景由主进程调用）
   * 这个是「主进程 → 桌宠」的推送，不需要 ipcMain.handle。
   */
  function notifyPet(payload: PetNotifyPayload): void {
    const w = getPetWindow()
    if (w && !w.isDestroyed()) {
      w.webContents.send(IPC_CHANNELS.PET_NOTIFY, payload)
    }
  }
  // 暴露给同模块的其它处理器（如策略信号转发）使用
  ;(globalThis as unknown as { __notifyPet?: typeof notifyPet }).__notifyPet = notifyPet

  // ===== 研究报告 =====
  ipcMain.handle(
    IPC_CHANNELS.RESEARCH_LIST,
    async (_event, req: ResearchListRequest): Promise<ResearchListResponse> => {
      const db = await getDb()
      return { reports: listReports(db, typeof req?.limit === 'number' ? req.limit : 100) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RESEARCH_GET,
    async (_event, req: ResearchGetRequest): Promise<ResearchGetResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid research:get request: id required')
      }
      const db = await getDb()
      return { report: getReport(db, req.id) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RESEARCH_DELETE,
    async (_event, req: ResearchDeleteRequest): Promise<ResearchDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid research:delete request: id required')
      }
      const db = await getDb()
      return { success: deleteReport(db, req.id) }
    }
  )

  // 导出单篇研究报告为 .md 文件
  ipcMain.handle(
    IPC_CHANNELS.RESEARCH_EXPORT,
    async (_event, req: ResearchExportRequest): Promise<ResearchExportResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid research:export request: id required')
      }
      const db = await getDb()
      const report = getReport(db, req.id)
      if (!report) return { success: false }

      const safe = report.query.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
      const date = new Date(report.created_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      const dateStr = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
      const defaultPath = `研究报告-${safe}-${dateStr}.md`

      const result = await dialog.showSaveDialog(getMgr().getWindow(), {
        title: '导出研究报告',
        defaultPath,
        filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
      })

      if (result.canceled || !result.filePath) return { success: false }

      const md =
        `# ${report.query}\n\n` +
        `> 生成时间：${formatReportTime(report.created_at)}　模式：${reportModeLabel(report.mode)}\n\n` +
        `${report.report}\n`
      writeFileSync(result.filePath, md, 'utf8')
      return { success: true, path: result.filePath }
    }
  )

  // ===== 笔记 =====

  // 复用已配置的 LLM 客户端做自由对话（笔记讨论 / 知识库问答）
  function makeLlmClient(): LLMClient {
    const cfg = getConfig()
    return new LLMClient({
      baseUrl: cfg.llm.baseUrl,
      apiKey: cfg.llm.apiKey,
      model: cfg.llm.model,
    })
  }

  ipcMain.handle(
    IPC_CHANNELS.NOTES_GET_ALL,
    async (_event, _req: NotesGetAllRequest): Promise<NotesGetAllResponse> => {
      const db = await getDb()
      return { notes: listNotes(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_GET,
    async (_event, req: NotesGetRequest): Promise<NotesGetResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid notes:get request: id required')
      }
      const db = await getDb()
      return { note: getNote(db, req.id) }
    }
  )

  // 笔记变更广播：任何写操作后推送给所有内容区。
  // 注意：内容区是 WebContentsView（独立 webContents），BrowserWindow.getAllWindows() 只返回顶层
  // 窗口、覆盖不到它，故必须用 webContents.getAllWebContents() 才能同时触达右侧 dock（顶层窗口）
  // 与中间页（WebContentsView），实现真正的双向同步。
  const broadcastNotes = (payload: NotesUpdatedEvent): void => {
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) wc.send(IPC_CHANNELS.NOTES_UPDATED, payload)
    }
  }

  ipcMain.handle(
    IPC_CHANNELS.NOTES_SAVE,
    async (_event, req: NotesSaveRequest): Promise<NotesSaveResponse> => {
      if (!req || typeof req !== 'object') {
        throw new Error('Invalid notes:save request')
      }
      const db = await getDb()
      // 乐观锁：若指定 id 且基线 updated_at 与库内不一致，说明别处已改过，返回冲突不写入
      if (typeof req.id === 'number' && !req.force && typeof req.baseUpdatedAt === 'number') {
        const cur = getNote(db, req.id)
        if (cur && cur.updated_at !== req.baseUpdatedAt) {
          return { conflict: true, note: cur }
        }
      }
      const note = saveNote(db, {
        id: typeof req.id === 'number' ? req.id : undefined,
        title: req.title,
        content: req.content,
        chat: req.chat,
        pin: typeof req.pin === 'number' ? req.pin : undefined,
        tags: req.tags,
      })
      // 同步镜像到 .md 文件（自动同步，DB 为唯一事实源）
      try {
        syncNoteToFile(note)
      } catch (err) {
        console.error('[notes-sync] 保存后同步文件失败：', err)
      }
      // 异步更新该笔记的向量（供知识库 RAG 检索），不阻塞保存响应
      const text = `${note.title}\n${note.content}`.trim()
      if (text) {
        void (async () => {
          try {
            const emb = await embedText(text)
            setNoteEmbedding(db, note.id, emb)
          } catch (err) {
            console.error('[kb] 笔记向量更新失败（不影响保存）：', err)
          }
        })()
      } else {
        // 内容清空时清掉旧向量，避免垃圾向量参与检索
        try {
          setNoteEmbedding(db, note.id, [])
        } catch {
          /* 忽略 */
        }
      }
      broadcastNotes({ note })
      return { note }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_DELETE,
    async (_event, req: NotesDeleteRequest): Promise<NotesDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid notes:delete request: id required')
      }
      const db = await getDb()
      const ok = deleteNote(db, req.id)
      if (ok) {
        // 同步清理镜像文件（按 id 前缀，不依赖标题）
        try {
          removeNoteFile(req.id)
        } catch (err) {
          console.error('[notes-sync] 删除后清理文件失败：', err)
        }
        broadcastNotes({ deletedId: req.id })
      }
      return { success: ok }
    }
  )

  // 笔记 .md 自动同步目录（供前端一键打开）
  ipcMain.handle(
    IPC_CHANNELS.NOTES_SYNC_DIR,
    async (): Promise<NotesSyncDirResponse> => {
      return { path: getNotesSyncDir() }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_CHAT,
    async (_event, req: NotesChatRequest): Promise<NotesChatResponse> => {
      if (!req || !Array.isArray(req.messages) || req.messages.length === 0) {
        throw new Error('Invalid notes:chat request: messages required')
      }
      const sys = req.context && req.context.trim()
        ? '你是一个善于倾听与发散思维的思考伙伴。下面是你正在协助整理的笔记正文，可作为背景参考：\n\n' +
          req.context.trim() +
          '\n\n请基于笔记与对话，帮助用户梳理想法、指出盲点、提出追问。回答简洁、有洞见，使用中文。'
        : '你是一个善于倾听与发散思维的思考伙伴。请帮助用户梳理想法、指出盲点、提出追问。回答简洁、有洞见，使用中文。'
      const messages = [
        { role: 'system' as const, content: sys },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ]
      const reply = await makeLlmClient().chat(messages)
      return { reply }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_KB_QUERY,
    async (_event, req: NotesKbQueryRequest): Promise<NotesKbQueryResponse> => {
      if (!req || typeof req.question !== 'string' || !req.question.trim()) {
        throw new Error('Invalid notes:kbQuery request: question required')
      }
      const db = await getDb()
      const all = getAllNotesForKb(db).filter((n) => n.content.trim().length > 0)
      if (all.length === 0) {
        throw new Error('还没有任何笔记内容可作为知识库，先去写几条笔记吧')
      }

      // 真正喂给 LLM 的笔记上下文，以及对应来源（RAG 模式下直接来自检索结果）
      let contextNotes: Array<{ id: number; title: string; content: string }> = []
      let ragSources: Array<{ id: number; title: string }> = []

      // ---- RAG：本地向量检索（离线、不依赖 LLM API）----
      // 1) 回填缺失向量（老笔记或新建后尚未向量化的）
      let ragOk = false
      try {
        const need = getNotesNeedingEmbedding(db)
        for (const n of need) {
          try {
            const emb = await embedText(`${n.title}\n${n.content}`)
            setNoteEmbedding(db, n.id, emb)
          } catch (e) {
            console.error(`[kb] 笔记 ${n.id} 向量化失败，跳过：`, e)
          }
        }
        // 2) 问题向量化 + Top-K 余弦检索
        const top = await retrieveTopK(db, req.question, 6)
        if (top.length > 0) {
          contextNotes = top
          ragSources = top.map((t) => ({ id: t.id, title: t.title }))
          ragOk = true
        }
      } catch (err) {
        console.error('[kb] 向量检索失败，回退到全文灌入：', err)
      }

      // 兜底：向量不可用（如首次下载模型失败）时，退回「全量灌入」旧行为
      if (!ragOk) {
        contextNotes = all
        ragSources = []
      }

      const kb = contextNotes
        .map((n) => `【笔记 ${n.id}】${n.title}\n${n.content}`)
        .join('\n\n---\n\n')
      const sys =
        '你是用户的个人知识库助手。下面是从用户笔记中提取的内容。请仅基于这些内容回答用户问题；' +
        '若内容中没有相关信息，明确说明「笔记中未提及」。引用时标注来源笔记编号。回答使用中文，简明扼要。'
      const answer = await makeLlmClient().chat([
        { role: 'system', content: sys },
        {
          role: 'user',
          content: `知识库内容：\n\n${kb}\n\n用户问题：${req.question}`,
        },
      ])

      // 来源：RAG 模式下直接取真正喂给模型的笔记（最可靠）；
      // 兜底模式下用宽松正则从答案里解析引用编号，并校验存在于知识库中
      let sources = ragSources
      if (!ragOk) {
        const idSet = new Set(all.map((n) => n.id))
        const cited = new Set(
          Array.from(answer.matchAll(/笔记\s*#?\s*(\d+)/g))
            .map((m) => Number(m[1]))
            .filter((id) => idSet.has(id))
        )
        sources = all
          .filter((n) => cited.has(n.id))
          .map((n) => ({ id: n.id, title: n.title }))
      }
      return { answer, sources }
    }
  )

  // 全文搜索笔记
  ipcMain.handle(
    IPC_CHANNELS.NOTES_SEARCH,
    async (_event, req: NotesSearchRequest): Promise<NotesSearchResponse> => {
      if (!req || typeof req.query !== 'string') {
        throw new Error('Invalid notes:search request: query required')
      }
      const db = await getDb()
      return { notes: searchNotes(db, req.query) }
    }
  )

  // 导出单条或全部笔记为 Markdown 文件
  ipcMain.handle(
    IPC_CHANNELS.NOTES_EXPORT,
    async (_event, req: NotesExportRequest): Promise<NotesExportResponse> => {
      const db = await getDb()
      const notes = req && typeof req.id === 'number'
        ? [getNote(db, req.id)].filter((n): n is NonNullable<typeof n> => n !== null)
        : getAllNotesFull(db)
      if (notes.length === 0) return { success: false }

      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (t: number) => {
        const d = new Date(t)
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      }
      const safe = (s: string) => s.replace(/[\\/:*?"<>|#]/g, '_').slice(0, 40) || '未命名'

      const buildMd = (n: Note) => {
        const lines: string[] = []
        lines.push(`# ${n.title || '（无标题）'}`)
        lines.push('')
        lines.push(`> 更新：${fmt(n.updated_at)}　${n.pin ? '📌 置顶' : ''}`)
        if (n.tags && n.tags.length > 0) {
          lines.push('')
          lines.push(`> 标签：${n.tags.map((t) => `#${t}`).join(' ')}`)
        }
        lines.push('')
        lines.push(n.content || '')
        if (n.chat && n.chat.length > 0) {
          lines.push('')
          lines.push('---')
          lines.push('')
          lines.push('## 💬 讨论记录')
          for (const m of n.chat) {
            lines.push('')
            lines.push(`**${m.role === 'user' ? '我' : 'AI'}：**`)
            lines.push('')
            lines.push(m.content)
          }
        }
        return lines.join('\n')
      }

      const defaultName =
        notes.length === 1
          ? `笔记-${safe(notes[0].title)}-${fmt(notes[0].updated_at).slice(0, 10)}.md`
          : `笔记导出-${notes.length}篇-${fmt(Date.now()).slice(0, 10)}.md`

      const result = await dialog.showSaveDialog(getMgr().getWindow(), {
        title: notes.length === 1 ? '导出笔记' : `导出 ${notes.length} 篇笔记`,
        defaultPath: defaultName,
        filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
      })
      if (result.canceled || !result.filePath) return { success: false }

      const sep = '\n\n---\n\n'
      writeFileSync(result.filePath, notes.map(buildMd).join(sep), 'utf8')
      return { success: true, path: result.filePath }
    }
  )

  // 用系统打开文件 / 在文件管理器中显示其所在文件夹
  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN,
    async (_event, req: ShellOpenRequest): Promise<ShellOpenResponse> => {
      if (!req || typeof req.path !== 'string' || !req.path.trim()) {
        throw new Error('Invalid shell:open request: path required')
      }
      try {
        if (req.reveal) {
          shell.showItemInFolder(req.path)
        } else {
          await shell.openPath(req.path)
        }
        return { success: true }
      } catch (err) {
        throw new Error(`无法打开文件：${err instanceof Error ? err.message : String(err)}`)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_GET_HISTORY,
    async (_event, req: AiGetHistoryRequest): Promise<AiGetHistoryResponse> => {
      if (req?.symbol !== undefined && typeof req.symbol !== 'string') {
        throw new Error('Invalid ai:getHistory request')
      }
      if (req?.limit !== undefined && typeof req.limit !== 'number') {
        throw new Error('Invalid ai:getHistory request')
      }
      const records = await aiService.getHistory({
        symbol: req?.symbol,
        limit: req?.limit,
      })
      return { records }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DELETE_RECORD,
    async (_event, req: AiDeleteRecordRequest): Promise<AiDeleteRecordResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid ai:deleteRecord request: id required')
      }
      const success = await aiService.deleteRecord(req.id)
      return { success }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_GET_CONFIG,
    (_event, _req: AiGetConfigRequest): AiGetConfigResponse => {
      return aiService.getPublicConfig()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_SET_CONFIG,
    (_event, req: AiSetConfigRequest): AiSetConfigResponse => {
      if (!req || typeof req !== 'object') {
        throw new Error('Invalid ai:setConfig request')
      }
      for (const key of ['baseUrl', 'apiKey', 'model', 'fastModel'] as const) {
        if (req[key] !== undefined && typeof req[key] !== 'string') {
          throw new Error(`Invalid ai:setConfig request: ${key} must be string`)
        }
      }
      aiService.setConfig({
        baseUrl: req.baseUrl,
        apiKey: req.apiKey,
        model: req.model,
        fastModel: req.fastModel,
      })
      return { success: true }
    }
  )

  // ---------- AI 量化策略 ----------

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_GENERATE,
    async (_event, req: StrategyGenerateRequest): Promise<StrategyGenerateResponse> => {
      if (!req || typeof req.goal !== 'string' || !req.goal.trim()) {
        throw new Error('Invalid strategy:generate request: goal required')
      }
      return generateStrategy({
        goal: req.goal.trim(),
        symbols: Array.isArray(req.symbols) ? req.symbols : undefined,
        period: req.period,
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_SAVE,
    async (_event, req: StrategySaveRequest): Promise<StrategySaveResponse> => {
      if (
        !req ||
        typeof req.title !== 'string' ||
        typeof req.goal !== 'string' ||
        !req.config ||
        typeof req.config !== 'object'
      ) {
        throw new Error('Invalid strategy:save request')
      }
      const db = await getDb()
      const strategy =
        typeof req.id === 'number'
          ? updateStrategy(db, {
              id: req.id,
              title: req.title.trim(),
              goal: req.goal.trim(),
              config: req.config,
            })
          : addStrategy(db, {
              title: req.title.trim(),
              goal: req.goal.trim(),
              config: req.config,
            })
      if (!strategy) throw new Error('保存策略失败')
      return { strategy }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_LIST,
    async (): Promise<StrategyListResponse> => {
      const db = await getDb()
      return { strategies: listStrategies(db) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_GET,
    async (_event, req: StrategyGetRequest): Promise<StrategyGetResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid strategy:get request: id required')
      }
      const db = await getDb()
      const strategy = getStrategy(db, req.id)
      if (!strategy) throw new Error('策略不存在')
      return { strategy }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_DELETE,
    async (_event, req: StrategyDeleteRequest): Promise<StrategyDeleteResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid strategy:delete request: id required')
      }
      const db = await getDb()
      return { success: deleteStrategy(db, req.id) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_BACKTEST,
    async (_event, req: StrategyBacktestRequest): Promise<StrategyBacktestResponse> => {
      if (!req || typeof req.id !== 'number') {
        throw new Error('Invalid strategy:backtest request: id required')
      }
      const db = await getDb()
      const strategy = getStrategy(db, req.id)
      if (!strategy) throw new Error('策略不存在')
      // 优先用真实 K 线回测，K 线不可用时退回本地轮询快照
      const results = await backtestStrategy(
        db,
        strategy.config,
        getQuoteProvider(),
        req.bars ?? 250
      )
      return { results, generatedAt: Date.now() }
    }
  )

  // ---------- 策略运行态（实时买卖点） ----------
  let strategyRunner: StrategyRunner | null = null
  const getRunner = (): StrategyRunner => {
    if (!strategyRunner) strategyRunner = new StrategyRunner(getQuoteProvider())
    return strategyRunner
  }

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_RUN,
    async (_event, req: StrategyRunRequest): Promise<StrategyRunResponse> => {
      if (!req || typeof req.id !== 'number') throw new Error('Invalid strategy:run request: id required')
      const db = await getDb()
      const strategy = getStrategy(db, req.id)
      if (!strategy) throw new Error('策略不存在')
      if (strategy.config.symbols.length === 0) {
        throw new Error('该策略未指定标的，无法运行（请在生成/编辑时补充标的）')
      }
      const runner = getRunner()
      await runner.start(strategy)
      const running = runner.getRunning().find((r) => r.id === req.id)
      if (!running) throw new Error('启动策略运行失败')
      return { running }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_STOP,
    async (_event, req: StrategyStopRequest): Promise<StrategyStopResponse> => {
      if (!req || typeof req.id !== 'number') throw new Error('Invalid strategy:stop request: id required')
      getRunner().stop(req.id)
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_STOP_ALL,
    async (): Promise<StrategyStopAllResponse> => {
      getRunner().stopAll()
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_CHECK,
    async (_event, req: StrategyCheckRequest): Promise<StrategyCheckResponse> => {
      if (!req || typeof req.id !== 'number') throw new Error('Invalid strategy:check request: id required')
      const db = await getDb()
      const strategy = getStrategy(db, req.id)
      if (!strategy) throw new Error('策略不存在')
      if (strategy.config.symbols.length === 0) throw new Error('该策略未指定标的，无法检查')
      const runner = getRunner()
      // 未运行则先启动（拿到 K 线序列才能判定）
      if (!runner.isRunning(req.id)) await runner.start(strategy)
      const signals = await runner.checkOnce(req.id)
      return { signals }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_STATUS,
    async (): Promise<StrategyStatusResponse> => {
      return { running: getRunner().getRunning() }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STRATEGY_SIGNALS,
    async (_event, req: StrategySignalsRequest): Promise<StrategySignalsResponse> => {
      if (!req || typeof req.id !== 'number') throw new Error('Invalid strategy:signals request: id required')
      const db = await getDb()
      return { signals: getSignals(db, req.id) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_GET_CAPABILITIES,
    (_event, _req: AgentGetCapabilitiesRequest): AgentGetCapabilitiesResponse => {
      return { capabilities: getConfig().agent }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SET_CAPABILITIES,
    (_event, req: AgentSetCapabilitiesRequest): AgentSetCapabilitiesResponse => {
      if (!req || typeof req !== 'object' || !req.capabilities) {
        throw new Error('Invalid agent:setCapabilities request')
      }
      updateConfig({ agent: req.capabilities })
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AGENT_TEST_MCP,
    async (_event, req: AgentTestMcpRequest): Promise<AgentTestMcpResponse> => {
      return testMcpServer(req.server)
    }
  )

  // ---------- 网页缩放（地址栏缩放控件） ----------
  ipcMain.handle(
    IPC_CHANNELS.APP_ZOOM,
    async (_event, req: AppZoomRequest): Promise<AppZoomResponse> => {
      if (!req || !['in', 'out', 'reset'].includes(req.action)) {
        throw new Error('Invalid app:zoom request: action must be in | out | reset')
      }
      const dir = req.action === 'in' ? 1 : req.action === 'out' ? -1 : 0
      // 地址栏控件触发：优先缩放活动网页标签，而不是焦点所在的应用界面
      return { percent: stepCurrentZoom(dir, { preferActiveTab: true }) }
    }
  )

  // 应用退出前停止所有策略运行轮询
  app.on('before-quit', () => {
    strategyRunner?.stopAll()
  })
}
