/**
 * IPC 通道统一定义
 * 所有主进程与渲染进程之间的通信必须通过这里定义的类型。
 * 主进程和渲染进程都依赖此文件，确保类型一致。
 */

import type { AgentCapabilitiesConfig, McpServerConfig } from './agent-capabilities'

// ---------- 通道名称 ----------
export const IPC_CHANNELS = {
  PING: 'app:ping',
  APP_FOCUS_ADDRESS: 'app:focusAddress', // 主进程 -> 渲染进程：聚焦地址栏
  ZOOM_CHANGED: 'app:zoomChanged', // 主进程 -> 渲染进程：网页缩放比例变化
  APP_ZOOM: 'app:zoom', // 渲染进程 -> 主进程：地址栏缩放控件（放大/缩小/重置当前内容）

  // Spaces - 空间管理
  SPACES_GET_ALL: 'spaces:getAll',
  SPACES_SWITCH: 'spaces:switch',
  SPACES_CREATE: 'spaces:create',
  SPACES_UPDATE: 'spaces:update',
  SPACES_DELETE: 'spaces:delete',

  // Tabs - 标签管理
  TABS_GET_ALL: 'tabs:getAll',
  TABS_GET_ACTIVE: 'tabs:getActive',
  TABS_CREATE: 'tabs:create',
  TABS_CLOSE: 'tabs:close',
  TABS_SWITCH: 'tabs:switch',
  TABS_RELOAD: 'tabs:reload',
  TABS_GO_BACK: 'tabs:goBack',
  TABS_GO_FORWARD: 'tabs:goForward',
  TABS_NAVIGATE: 'tabs:navigate',
  TABS_REORDER: 'tabs:reorder',
  TABS_SHOW_CONTEXT_MENU: 'tabs:showContextMenu',
  TABS_UPDATED: 'tabs:updated', // 主进程主动推送：标签列表发生变化

  // Bookmarks - 书签管理
  BOOKMARKS_GET_ALL: 'bookmarks:getAll',
  BOOKMARKS_ADD: 'bookmarks:add',
  BOOKMARKS_DELETE: 'bookmarks:delete',
  BOOKMARKS_UPDATE: 'bookmarks:update',
  BOOKMARKS_REORDER: 'bookmarks:reorder',
  BOOKMARKS_SET_GROUP: 'bookmarks:setGroup',
  BOOKMARK_GROUPS_GET: 'bookmarkGroups:get',
  BOOKMARK_GROUPS_CREATE: 'bookmarkGroups:create',
  BOOKMARK_GROUPS_UPDATE: 'bookmarkGroups:update',
  BOOKMARK_GROUPS_DELETE: 'bookmarkGroups:delete',

  // Strategy - AI 量化策略
  STRATEGY_GENERATE: 'strategy:generate',
  STRATEGY_SAVE: 'strategy:save',
  STRATEGY_LIST: 'strategy:list',
  STRATEGY_GET: 'strategy:get',
  STRATEGY_DELETE: 'strategy:delete',
  STRATEGY_BACKTEST: 'strategy:backtest',
  STRATEGY_RUN: 'strategy:run',
  STRATEGY_STOP: 'strategy:stop',
  STRATEGY_STOP_ALL: 'strategy:stopAll',
  STRATEGY_CHECK: 'strategy:check',
  STRATEGY_STATUS: 'strategy:status',
  STRATEGY_SIGNALS: 'strategy:signals',
  STRATEGY_SIGNAL: 'strategy:signal', // 主进程主动推送（买卖点）

  // Window - 窗口布局通知
  WINDOW_SET_WEB_AREA_BOUNDS: 'window:setWebAreaBounds', // 渲染进程上报实测网页区矩形
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggleFullscreen',

  // App log - 运行日志（底部面板「日志」页）
  APP_LOG_TAIL: 'app:log:tail',
  APP_LOG_OPEN_DIR: 'app:log:openDir',

  // Watchlist - 自选股管理
  WATCHLIST_GET_ALL: 'watchlist:getAll',
  WATCHLIST_ADD: 'watchlist:add',
  WATCHLIST_REMOVE: 'watchlist:remove',
  WATCHLIST_REORDER: 'watchlist:reorder',
  WATCHLIST_SEARCH: 'watchlist:search',

  // Watchlist 分组（自定义分组 + 智能分组）
  WATCHLIST_GROUPS_GET: 'watchlist:groups:get',
  WATCHLIST_GROUP_CREATE: 'watchlist:group:create',
  WATCHLIST_GROUP_UPDATE: 'watchlist:group:update',
  WATCHLIST_GROUP_DELETE: 'watchlist:group:delete',
  WATCHLIST_SET_GROUP: 'watchlist:setGroup',
  WATCHLIST_UPDATE: 'watchlist:update',
  WATCHLIST_UPDATED: 'watchlist:updated', // 主进程主动推送（任何写操作后广播最新列表）

  // Web / 页面链接采集
  WEB_GET_LINKS: 'web:getLinks',
  // AI 分析任意 URL（无头加载后抽取正文）

  // Agent 深度研究（LangChain 代理）
  AGENT_RUN: 'agent:run',
  AGENT_STREAM: 'agent:stream',
  AGENT_STOP: 'agent:stop',
  // Agent 能力管理（工具 / Skills / MCP）
  AGENT_GET_CAPABILITIES: 'agent:getCapabilities',
  AGENT_SET_CAPABILITIES: 'agent:setCapabilities',
  AGENT_TEST_MCP: 'agent:testMcp',

  // 研究报告落库
  RESEARCH_LIST: 'research:list',
  RESEARCH_GET: 'research:get',
  RESEARCH_DELETE: 'research:delete',
  RESEARCH_EXPORT: 'research:export',

  // Quotes - 行情数据
  QUOTES_GET_LATEST: 'quotes:getLatest',
  QUOTES_REFRESH: 'quotes:refresh',
  QUOTES_UPDATED: 'quotes:updated', // 主进程主动推送
  QUOTE_HISTORY_GET: 'quoteHistory:get',

  // PageVisits - 浏览轨迹
  PAGE_VISITS_GET_SUMMARY: 'pageVisits:getSummary',
  PAGE_VISITS_GET_BY_STOCK: 'pageVisits:getByStock',
  PAGE_VISITS_EXPORT: 'pageVisits:export',
  PAGE_VISITS_DELETE: 'pageVisits:delete',
  PAGE_VISITS_CLEAR_ALL: 'pageVisits:clearAll',

  // Settings - 设置
  SETTINGS_GET_TRACKING_ENABLED: 'settings:getTrackingEnabled',
  SETTINGS_SET_TRACKING_ENABLED: 'settings:setTrackingEnabled',
  SETTINGS_GET_BLACKLIST: 'settings:getBlacklist',
  SETTINGS_SET_BLACKLIST: 'settings:setBlacklist',
  SETTINGS_GET_TRADING_CALENDAR: 'settings:getTradingCalendar',
  SETTINGS_SET_TRADING_CALENDAR: 'settings:setTradingCalendar',
  SETTINGS_GET_SEARCH_ENGINE: 'settings:getSearchEngine',
  SETTINGS_SET_SEARCH_ENGINE: 'settings:setSearchEngine',
  SETTINGS_GET_QUOTE_INTERVAL: 'settings:getQuoteInterval',
  SETTINGS_SET_QUOTE_INTERVAL: 'settings:setQuoteInterval',

  // Trades - 交易记录
  TRADES_GET_ALL: 'trades:getAll',
  TRADES_ADD: 'trades:add',
  TRADES_UPDATE: 'trades:update',
  TRADES_DELETE: 'trades:delete',
  TRADES_IMPORT_PARSE: 'trades:importParse',
  TRADES_IMPORT_BULK: 'trades:importBulk',

  // Reviews - 复盘笔记
  REVIEWS_SAVE: 'reviews:save',
  REVIEWS_DELETE: 'reviews:delete',

  // Notes - 笔记（随时记录 + 与 AI 讨论 + 作为个人知识库）
  NOTES_GET_ALL: 'notes:getAll',
  NOTES_GET: 'notes:get',
  NOTES_SAVE: 'notes:save',
  NOTES_DELETE: 'notes:delete',
  NOTES_CHAT: 'notes:chat',
  NOTES_KB_QUERY: 'notes:kbQuery',
  NOTES_SEARCH: 'notes:search',
  NOTES_EXPORT: 'notes:export',

  // 笔记 .md 自动同步目录查询
  NOTES_SYNC_DIR: 'notes:syncDir',

  // 笔记变更广播（主进程在任何写操作后推送，供多窗口/多实例实时同步）
  NOTES_UPDATED: 'notes:updated',

  // 主题模式切换（渲染进程通知主进程更新原生窗口控制按钮 titleBarOverlay 配色）
  THEME_SET: 'theme:set',
  // 主进程记住当前主题，渲染进程可查询（新页面挂载时对齐）
  THEME_GET: 'theme:get',
  // 主进程在主题变化后广播给所有 webContents（含 WebContentsView，跨 session partition 同步）
  THEME_UPDATED: 'theme:updated',

  // Shell - 用系统打开文件 / 在文件管理器中显示
  SHELL_OPEN: 'shell:open',

  // AI - 页面分析
  AI_ANALYZE_PAGE: 'ai:analyzePage',
  AI_ANALYZE_TEXT: 'ai:analyzeText',
  AI_GET_HISTORY: 'ai:getHistory',
  AI_DELETE_RECORD: 'ai:deleteRecord',
  AI_GET_CONFIG: 'ai:getConfig',
  AI_SET_CONFIG: 'ai:setConfig',
  AI_ANALYSIS_DONE: 'ai:analysisDone', // 主进程主动推送：右键菜单触发的分析完成
} as const

export type IpcChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ---------- 共享类型 ----------

/**
 * 空间 ID。内置三空间为 watch / research / review，自定义空间用 `space-<时间戳>` 形式
 * 的生成 id（id 创建后不可变：session partition 按它拼接，改名不会丢登录态）。
 */
export type SpaceId = string

export interface Space {
  id: SpaceId
  name: string
  icon: string
}

export interface Tab {
  id: string
  spaceId: SpaceId
  title: string
  url: string
  isActive: boolean
  canGoBack: boolean
  canGoForward: boolean
  symbol: string | null // 从 URL 识别出的股票代码，识别不到为 null
}

export interface Bookmark {
  id: number
  title: string
  url: string
  sort_order: number
  created_at: number
  group_id: number // 所属分组，0 = 未分组
}

/** 常用网站分组（纯自定义，无智能分组） */
export interface BookmarkGroup {
  id: number
  name: string
  sort_order: number
  created_at: number
  /** 'builtin' 系统内置分类 / 'custom' 用户自建 */
  kind?: 'builtin' | 'custom'
}

// ---------- AI 量化策略 ----------

/** 策略条件类型（回测引擎可解释执行的基础指标） */
export type StrategyConditionType =
  | 'ma_cross' // 快慢均线金叉/死叉
  | 'price_cross_ma' // 收盘价上穿/下穿均线
  | 'price_breakout' // 价格突破 N 日最高/最低
  | 'rsi' // RSI 超买/超卖
  | 'volume_surge' // 成交量放大
  | 'volume_shrink' // 成交量萎缩
  | 'macd_cross' // MACD 金叉/死叉
  | 'kdj_cross' // KDJ 金叉/死叉
  | 'boll' // 布林带上轨/下轨突破
  | 'change_pct' // 当日涨跌幅超过/低于阈值
  | 'consecutive' // 连续 N 日上涨/下跌
  | 'ma_alignment' // 均线多头/空头排列

export interface StrategyCondition {
  type: StrategyConditionType
  /** 方向；无方向的条件（如 volume_surge / volume_shrink）可省略 */
  direction?:
    | 'golden' // 金叉（快线上穿慢线）
    | 'death' // 死叉
    | 'above' // 上穿均线
    | 'below' // 下穿均线
    | 'break_high' // 突破 N 日最高
    | 'break_low' // 跌破 N 日最低
    | 'break_upper' // 突破布林上轨
    | 'break_lower' // 跌破布林下轨
    | 'up' // 上涨 / 多头
    | 'down' // 下跌 / 空头
    | 'bull' // 多头排列
    | 'bear' // 空头排列
    | 'overbought' // RSI 超买
    | 'oversold' // RSI 超卖
  fast?: number // 快线周期（ma_cross / macd_cross / ma_alignment）
  slow?: number // 慢线周期（ma_cross / macd_cross / ma_alignment）
  signalPeriod?: number // MACD 信号线周期（默认 9）
  maPeriod?: number // 均线周期（price_cross_ma）
  bollPeriod?: number // 布林带均线周期（默认 20）
  mult?: number // 布林带标准差倍数（默认 2）
  lookback?: number // 回看天数（price_breakout）
  days?: number // 连续天数（consecutive）
  threshold?: number // RSI 阈值 / 量比倍数 / 涨跌幅阈值
  label: string // 人类可读描述
}

export interface StrategyRuleConfig {
  symbols: string[] // 标的代码池（如 600519）
  period: 'day' | 'week' | '60m' | '15m' | '5m'
  entry: { logic: 'and' | 'or'; conditions: StrategyCondition[] }
  exit: { logic: 'and' | 'or'; conditions: StrategyCondition[] }
  risk: {
    stopLossPct?: number // 止损百分比（正数，如 5 表示 -5%）
    takeProfitPct?: number // 止盈百分比
    maxHoldDays?: number // 最大持有天数
    positionPct?: number // 仓位比例 0~100
  }
  description: string // LLM 生成的人话说明
}

export interface Strategy {
  id: number
  title: string
  goal: string // 用户自然语言目标
  config: StrategyRuleConfig
  created_at: number
  updated_at: number
}

export interface StrategySummary {
  id: number
  title: string
  goal: string
  created_at: number
  /** 列表元信息：标的数 / 条件数（避免打开详情才知道策略规模） */
  symbolCount?: number
  conditionCount?: number
}

// 自选股条目
export interface WatchlistItem {
  id: number
  symbol: string
  name: string
  group_id: number
  sort_order: number
  created_at: number
}

// 自选股分组（自定义分组 / 智能分组）
import type { WatchlistGroupKind } from './watchlist-groups'
export type { WatchlistGroupKind }
export interface WatchlistGroup {
  id: number
  name: string
  kind: WatchlistGroupKind
  rule: string | null
  sortOrder: number
  createdAt: number
}

// 股票搜索结果
export interface StockSearchResult {
  symbol: string
  name: string
  market: string
}

// 行情数据
export interface Quote {
  symbol: string
  name: string
  price: number
  changePercent: number
  changeAmount: number
  open: number
  prevClose: number
  high: number
  low: number
  volume: number
  amount: number
  timestamp: number
}

// 行情更新推送
export interface QuotesUpdate {
  quotes: Quote[]
  timestamp: number
  error: string | null
}

// 浏览轨迹
export interface PageVisit {
  id: number
  url: string
  title: string | null
  symbol: string | null
  space: string
  started_at: number
  duration_ms: number
}

// 按股票聚合的浏览统计
export interface StockVisitSummary {
  symbol: string
  name: string | null
  visit_count: number
  total_duration_ms: number
}

// ---------- 交易与复盘类型 ----------

export type TradeSide = 'buy' | 'sell'

export interface Trade {
  id: number
  symbol: string
  name: string
  side: TradeSide
  price: number
  quantity: number
  traded_at: number
  fee: number
  source: string
  confirmed: number
  buy_reason: string | null
  sell_reason: string | null
}

export interface ReviewNote {
  id: number
  trade_id: number
  was_reason_valid: number | null // 1 理由成立 / 0 不成立 / null 未评价
  did_well: string | null
  did_wrong: string | null
  next_time: string | null
  updated_at: number
}

// 交易 + 其复盘笔记（列表展示用）
export interface TradeWithReview {
  trade: Trade
  review: ReviewNote | null
}

// ---------- AI 分析类型 ----------

// 页面类型，用于选择不同的 Prompt
export type PageType =
  | 'announcement' // 公告
  | 'news' // 新闻
  | 'financial_report' // 财报
  | 'community' // 社区讨论
  | 'general' // 通用

// 分析模式
export type AnalysisMode = 'page' | 'selection' // 整页分析 / 选中文本分析

export interface BullishBearishItem {
  point: string // 要点
  evidence: string // 原文依据
}

export interface KeyDataItem {
  name: string // 数据名称
  value: string // 数值
  period?: string // 期间
}

export interface AiAnalysisResult {
  summary: string // 页面核心事实摘要
  bullish: BullishBearishItem[] // 利好因素列表
  bearish: BullishBearishItem[] // 利空因素列表
  key_data: KeyDataItem[] // 关键数据
  uncertainties: string[] // 页面未说明或需要进一步核实的点
  source_type: 'fact' | 'opinion' // 事实（公告、财报）或 观点（社区讨论）
  truncated?: boolean // 输入是否被截断
}

// 一次分析的完整结果（结果 + 元信息）
export interface AiAnalysisView {
  id: number // 落库后的记录 ID
  url: string
  title: string
  symbol: string | null
  pageType: PageType
  mode: AnalysisMode
  result: AiAnalysisResult
  created_at: number
}

// 历史记录条目（不含完整结果，列表用）
export interface AiHistoryItem {
  id: number
  url: string
  symbol: string | null
  page_type: string
  created_at: number
  summary: string | null // 从 result_json 中解出的摘要
}

// ---------- 请求/响应类型 ----------

// app:focusAddress - 主进程菜单触发，通知渲染进程聚焦地址栏（无载荷）
export interface AppFocusAddressRequest {}

// app:log:tail - 读取当天运行日志的末尾若干行（底部面板「日志」页）
export interface AppLogTailRequest {
  lines?: number
}
export interface AppLogTailResponse {
  path: string // 当前日志文件路径（未初始化时为空）
  content: string // 末尾文本（文件不存在时为空）
}

// app:log:openDir - 在系统文件管理器里打开日志目录
export interface AppLogOpenDirRequest {}

// app:ping - 简单的 ping/pong 测试
export interface PingRequest {
  message: string
}

export interface PingResponse {
  message: string
  timestamp: number
}

// spaces:getAll
export interface SpacesGetAllRequest {}
export interface SpacesGetAllResponse {
  spaces: Space[]
  activeSpaceId: SpaceId
}

// spaces:switch
export interface SpacesSwitchRequest {
  spaceId: SpaceId
}
export interface SpacesSwitchResponse {
  success: boolean
  tabs: Tab[]
  activeTabId: string | null
}

// spaces:create / update / delete —— 自定义空间
export interface SpacesCreateRequest {
  name: string
  icon?: string
}
export interface SpacesCreateResponse {
  space: Space
}
export interface SpacesUpdateRequest {
  spaceId: SpaceId
  name?: string
  icon?: string
}
export interface SpacesUpdateResponse {
  space: Space
}
export interface SpacesDeleteRequest {
  spaceId: SpaceId
}
export interface SpacesDeleteResponse {
  success: boolean
  closedTabs: number
}

// tabs:getAll
export interface TabsGetAllRequest {}
export interface TabsGetAllResponse {
  tabs: Tab[]
  activeTabId: string | null
}

// tabs:getActive
export interface TabsGetActiveRequest {}
export interface TabsGetActiveResponse {
  tab: Tab | null
}

// tabs:create
export interface TabsCreateRequest {
  url?: string
  active?: boolean
}
export interface TabsCreateResponse {
  tab: Tab
}

// tabs:close
export interface TabsCloseRequest {
  tabId: string
}
export interface TabsCloseResponse {
  success: boolean
  tabs: Tab[]
  activeTabId: string | null
}

// tabs:switch
export interface TabsSwitchRequest {
  tabId: string
}
export interface TabsSwitchResponse {
  success: boolean
}

// tabs:reload
export interface TabsReloadRequest {
  tabId?: string
}
export interface TabsReloadResponse {
  success: boolean
}

// tabs:goBack
export interface TabsGoBackRequest {
  tabId?: string
}
export interface TabsGoBackResponse {
  success: boolean
}

// tabs:goForward
export interface TabsGoForwardRequest {
  tabId?: string
}
export interface TabsGoForwardResponse {
  success: boolean
}

// tabs:navigate
export interface TabsNavigateRequest {
  tabId?: string
  url: string
}
export interface TabsNavigateResponse {
  success: boolean
}

// tabs:reorder - 拖拽调整标签顺序
export interface TabsReorderRequest {
  ids: string[]
}
export interface TabsReorderResponse {
  success: boolean
}

// tabs:showContextMenu - 渲染进程请求弹出标签右键菜单
// （关闭其他 / 关闭右侧由主进程在菜单回调里直接调用 TabManager，不走 IPC）
export interface TabsShowContextMenuRequest {
  tabId: string
}
export interface TabsShowContextMenuResponse {
  success: boolean
}

// bookmarks:getAll
export interface BookmarksGetAllRequest {}
export interface BookmarksGetAllResponse {
  bookmarks: Bookmark[]
}

// bookmarks:add
export interface BookmarksAddRequest {
  title: string
  url: string
  group_id?: number
}
export interface BookmarksAddResponse {
  bookmark: Bookmark
}

// bookmarks:delete
export interface BookmarksDeleteRequest {
  id: number
}
export interface BookmarksDeleteResponse {
  success: boolean
}

// bookmarks:update
export interface BookmarksUpdateRequest {
  id: number
  title: string
  url: string
  group_id?: number
}
export interface BookmarksUpdateResponse {
  bookmark: Bookmark | null
}

// bookmarks:reorder
export interface BookmarksReorderRequest {
  ids: number[]
}
export interface BookmarksReorderResponse {
  success: boolean
}

// bookmarkGroups:get
export interface BookmarkGroupsGetRequest {}
export interface BookmarkGroupsGetResponse {
  groups: BookmarkGroup[]
}

// bookmarkGroups:create
export interface BookmarkGroupsCreateRequest {
  name: string
}
export interface BookmarkGroupsCreateResponse {
  group: BookmarkGroup
}

// bookmarkGroups:update
export interface BookmarkGroupsUpdateRequest {
  id: number
  name: string
}
export interface BookmarkGroupsUpdateResponse {
  group: BookmarkGroup | null
}

// bookmarkGroups:delete（其下书签退回未分组）
export interface BookmarkGroupsDeleteRequest {
  id: number
}
export interface BookmarkGroupsDeleteResponse {
  success: boolean
}

// bookmarks:setGroup
export interface BookmarksSetGroupRequest {
  id: number
  groupId: number // 0 = 未分组
}
export interface BookmarksSetGroupResponse {
  success: boolean
}

// strategy:generate - 自然语言目标 → 结构化规则配置
export interface StrategyGenerateRequest {
  goal: string // 用户自然语言描述，如"茅台跌破60日线时买入，回到20日线上方卖出"
  symbols?: string[] // 可选标的池，不传则由模型推断
  period?: StrategyRuleConfig['period']
}
export interface StrategyGenerateResponse {
  title: string
  config: StrategyRuleConfig
}

// strategy:save - 落库（有 id 则覆盖更新，无 id 则新建）
export interface StrategySaveRequest {
  id?: number
  title: string
  goal: string
  config: StrategyRuleConfig
}
export interface StrategySaveResponse {
  strategy: Strategy
}

// strategy:list
export interface StrategyListRequest {}
export interface StrategyListResponse {
  strategies: StrategySummary[]
}

// strategy:get
export interface StrategyGetRequest {
  id: number
}
export interface StrategyGetResponse {
  strategy: Strategy
}

// strategy:delete
export interface StrategyDeleteRequest {
  id: number
}
export interface StrategyDeleteResponse {
  success: boolean
}

// strategy:backtest - 基于 quote_history 的轻量回测
export interface BacktestTrade {
  symbol: string
  entryTs: number
  entryPrice: number
  exitTs?: number
  exitPrice?: number
  pnlPct?: number
  exitReason?: string
}
export interface BacktestSymbolResult {
  symbol: string
  hasData: boolean
  /** 回测数据源：真实 K 线 / 本地轮询快照（K 线不可用时兜底） */
  source?: 'kline' | 'snapshot'
  /** 同期「买入并持有」收益率（%），用于判断策略是否真跑赢躺平 */
  benchmarkPct?: number
  /** 实际参与回测的 K 线根数 */
  barCount?: number
  trades: BacktestTrade[]
  summary: {
    total: number
    wins: number
    losses: number
    winRate: number // 0~1
    totalReturnPct: number
    maxDrawdownPct: number
    avgHoldDays?: number
  }
}
export interface StrategyBacktestRequest {
  id: number
  /** 回测取最近 N 根 K 线（默认 250≈1 年） */
  bars?: number
}
export interface StrategyBacktestResponse {
  results: BacktestSymbolResult[]
  generatedAt: number
}

// strategy 运行态 + 实时买卖点信号
export interface StrategySignal {
  id: number
  strategyId: number
  symbol: string
  action: 'buy' | 'sell'
  price: number
  reason: string
  ts: number
}

export interface RunningStrategyInfo {
  id: number
  title: string
  symbols: string[]
  startedAt: number
}

// strategy:run - 启动运行某策略（后台按行情实时判定买卖点）
export interface StrategyRunRequest {
  id: number
}
export interface StrategyRunResponse {
  running: RunningStrategyInfo
}

// strategy:stop - 停止运行
export interface StrategyStopRequest {
  id: number
}
export interface StrategyStopResponse {
  success: boolean
}

// strategy:stopAll - 停止全部运行中的策略
export interface StrategyStopAllRequest {}
export interface StrategyStopAllResponse {
  success: boolean
}

// strategy:check - 立即检查一次（不受交易时段限制，用于验证配置）
export interface StrategyCheckRequest {
  id: number
}
export interface StrategyCheckResponse {
  signals: StrategySignal[]
}

// strategy:status - 当前运行中的策略列表
export interface StrategyStatusRequest {}
export interface StrategyStatusResponse {
  running: RunningStrategyInfo[]
}

// strategy:signals - 某策略的历史信号（运行期间触发记录）
export interface StrategySignalsRequest {
  id: number
}
export interface StrategySignalsResponse {
  signals: StrategySignal[]
}

// app:zoomChanged - 主进程推送：当前缩放比例（100 = 100%）
export interface ZoomChangedPayload {
  factor: number // 1 = 100%
  percent: number
}

// app:zoom - 地址栏缩放控件：对当前内容缩放
export interface AppZoomRequest {
  action: 'in' | 'out' | 'reset'
}
export interface AppZoomResponse {
  percent: number | null
}

// window:setWebAreaBounds - 渲染进程把实测出的网页区矩形交给主进程
//
// 不再让主进程猜：顶栏高度、拖拽手柄宽度、边框、面板显隐都由渲染进程决定，
// 它用 getBoundingClientRect() 量出占位元素的真实矩形上报，主进程只负责照搬。
// 坐标是 CSS 像素（与 setBounds 的 DIP 一致），原点为窗口内容区左上角。
export interface WindowSetWebAreaBoundsRequest {
  x: number
  y: number
  width: number
  height: number
}
export interface WindowSetWebAreaBoundsResponse {
  success: boolean
}

// window:toggleFullscreen - 切换窗口全屏
export interface WindowToggleFullscreenRequest {}
export interface WindowToggleFullscreenResponse {
  fullscreen: boolean
}

// watchlist:getAll
export interface WatchlistGetAllRequest {}
export interface WatchlistGetAllResponse {
  items: WatchlistItem[]
}

// watchlist:add
export interface WatchlistAddRequest {
  symbol: string
  name: string
  groupId?: number
}
export interface WatchlistAddResponse {
  item: WatchlistItem
}

// watchlist:remove
export interface WatchlistRemoveRequest {
  symbol: string
}
export interface WatchlistRemoveResponse {
  success: boolean
}

// watchlist:reorder
export interface WatchlistReorderRequest {
  symbols: string[]
}
export interface WatchlistReorderResponse {
  success: boolean
}

// watchlist:groups:get
export interface WatchlistGroupsGetRequest {}
export interface WatchlistGroupsGetResponse {
  groups: WatchlistGroup[]
}

// watchlist:group:create
export interface WatchlistGroupCreateRequest {
  name: string
}
export interface WatchlistGroupCreateResponse {
  group: WatchlistGroup
}

// watchlist:group:update
export interface WatchlistGroupUpdateRequest {
  id: number
  name: string
}
export interface WatchlistGroupUpdateResponse {
  group: WatchlistGroup
}

// watchlist:group:delete
export interface WatchlistGroupDeleteRequest {
  id: number
}
export interface WatchlistGroupDeleteResponse {
  success: boolean
}

// watchlist:setGroup
export interface WatchlistSetGroupRequest {
  symbol: string
  groupId: number
}
export interface WatchlistSetGroupResponse {
  success: boolean
}

// watchlist:update - 目前支持重命名（自动识别的名称可能不准）
export interface WatchlistUpdateRequest {
  symbol: string
  name: string
}
export interface WatchlistUpdateResponse {
  item: WatchlistItem | null
}

// watchlist:search
export interface WatchlistSearchRequest {
  keyword: string
}
export interface WatchlistSearchResponse {
  results: StockSearchResult[]
}

// watchlist:updated - 主进程在自选股任何写操作后广播最新列表与分组
export interface WatchlistUpdateEvent {
  items: WatchlistItem[]
  groups: WatchlistGroup[]
}

// quotes:getLatest
export interface QuotesGetLatestRequest {}
export interface QuotesGetLatestResponse {
  quotes: Quote[]
  timestamp: number
  error: string | null
}

// 单条行情历史快照
export interface QuoteHistoryPoint {
  symbol: string
  ts: number
  price: number
  changePercent: number | null
  changeAmount: number | null
  open: number | null
  prevClose: number | null
  high: number | null
  low: number | null
  volume: number | null
  amount: number | null
}

// quoteHistory:get
export interface QuoteHistoryGetRequest {
  symbol: string
  fromTs: number
  toTs?: number
}
export interface QuoteHistoryGetResponse {
  history: QuoteHistoryPoint[]
}

// quotes:refresh
export interface QuotesRefreshRequest {}
export interface QuotesRefreshResponse {
  success: boolean
}

// pageVisits:getTodaySummary
// pageVisits:getSummary - 按日期 + 空间过滤的汇总
export interface PageVisitsGetSummaryRequest {
  date?: number // 可选：日期时间戳（毫秒），不传则今天
  space?: string // 可选：空间过滤（watch/research/review/...），不传则全部
}
export interface PageVisitsGetSummaryResponse {
  summaries: StockVisitSummary[]
}

// pageVisits:getByStock
export interface PageVisitsGetByStockRequest {
  symbol: string
  date?: number // 可选：日期时间戳（毫秒），不传则今天
  space?: string // 可选：空间过滤，不传则默认今天
}
export interface PageVisitsGetByStockResponse {
  visits: PageVisit[]
}

// pageVisits:export - 导出某天某空间的浏览轨迹为 CSV
export interface PageVisitsExportRequest {
  date?: number
  space?: string
}
export interface PageVisitsExportResponse {
  success: boolean
  path?: string
  count?: number
}

// pageVisits:clearAll
// pageVisits:delete - 删除单条访问记录
export interface PageVisitsDeleteRequest {
  id: number
}
export interface PageVisitsDeleteResponse {
  success: boolean
}

export interface PageVisitsClearAllRequest {}
export interface PageVisitsClearAllResponse {
  success: boolean
}

// settings:getTrackingEnabled
export interface SettingsGetTrackingEnabledRequest {}
export interface SettingsGetTrackingEnabledResponse {
  enabled: boolean
}

// settings:setTrackingEnabled
export interface SettingsSetTrackingEnabledRequest {
  enabled: boolean
}
export interface SettingsSetTrackingEnabledResponse {
  success: boolean
}

// settings:getBlacklist
export interface SettingsGetBlacklistRequest {}
export interface SettingsGetBlacklistResponse {
  domains: string[]
}

// settings:setBlacklist
export interface SettingsSetBlacklistRequest {
  domains: string[]
}
export interface SettingsSetBlacklistResponse {
  success: boolean
}

// settings:getSearchEngine
export interface SettingsGetSearchEngineRequest {}
export interface SettingsGetSearchEngineResponse {
  /** 搜索 URL 模板，%s 为搜索词占位符 */
  template: string
}

// settings:setSearchEngine
export interface SettingsSetSearchEngineRequest {
  template: string
}
export interface SettingsSetSearchEngineResponse {
  success: boolean
}

// settings:getQuoteInterval / setQuoteInterval
export interface QuoteIntervalConfig {
  /** 交易时段轮询间隔（毫秒） */
  tradingIntervalMs: number
  /** 非交易时段轮询间隔（毫秒） */
  nonTradingIntervalMs: number
}
export interface SettingsGetQuoteIntervalRequest {}
export interface SettingsGetQuoteIntervalResponse extends QuoteIntervalConfig {}
export interface SettingsSetQuoteIntervalRequest extends Partial<QuoteIntervalConfig> {}
export interface SettingsSetQuoteIntervalResponse extends QuoteIntervalConfig {}

// settings:getTradingCalendar
/** 交易日历配置：休市日与周末补班交易日（YYYY-MM-DD） */
export interface TradingCalendarConfig {
  holidays: string[]
  makeupWorkdays: string[]
}
export interface SettingsGetTradingCalendarRequest {}
export interface SettingsGetTradingCalendarResponse {
  config: TradingCalendarConfig
  defaultConfig: TradingCalendarConfig
}
export interface SettingsSetTradingCalendarRequest {
  config: TradingCalendarConfig
}
export interface SettingsSetTradingCalendarResponse {
  success: boolean
}

// trades:getAll
export interface TradesGetAllRequest {
  limit?: number
}
export interface TradesGetAllResponse {
  items: TradeWithReview[]
}

// trades:add
export interface TradesAddRequest {
  symbol: string
  name: string
  side: TradeSide
  price: number
  quantity: number
  traded_at: number
  fee?: number
  source?: string
  buy_reason?: string
  sell_reason?: string
}
export interface TradesAddResponse {
  trade: Trade | null // null 表示与已有记录重复
}

// trades:update
export interface TradesUpdateRequest {
  id: number
  symbol?: string
  name?: string
  side?: TradeSide
  price?: number
  quantity?: number
  traded_at?: number
  fee?: number
  source?: string
  // 允许显式传 null 清空理由（切换买卖方向时会用到）
  buy_reason?: string | null
  sell_reason?: string | null
}
export interface TradesUpdateResponse {
  trade: Trade | null
}

// trades:delete
export interface TradesDeleteRequest {
  id: number
}
export interface TradesDeleteResponse {
  success: boolean
}

// trades:importParse —— 解析券商交割单文本为结构化成交
export interface ParsedTrade {
  symbol: string
  name: string
  side: TradeSide
  price: number
  quantity: number
  amount: number | null
  fee: number
  tradedAt: number
}
export interface TradesImportParseRequest {
  text: string
}
export interface TradesImportParseResponse {
  trades: ParsedTrade[]
  method: 'heuristic' | 'llm'
  unmatched: string[]
  warnings: string[]
}
// trades:importBulk —— 批量写入解析后的成交（按唯一约束自动去重）
export interface TradesImportBulkRequest {
  trades: ParsedTrade[]
}
export interface TradesImportBulkResponse {
  inserted: number
  skipped: number
  errors: string[]
}

// web:getLinks —— 采集当前页面全部链接
export interface WebLink {
  text: string
  href: string
  isStock: boolean
  symbol: string | null
}
export interface WebGetLinksRequest {
  tabId?: string
}
export interface WebGetLinksResponse {
  links: WebLink[]
}
// ai:analyzeUrl —— 无头加载某个 URL 并分析（如右键「用 AI 分析此链接」）
// agent:run / agent:stream —— LangChain 深度研究代理
export type AgentMode = 'research' | 'deepen'
export type AgentEvent =
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; report: string }
  | { type: 'error'; message: string }
export interface AgentRunRequest {
  query: string
  mode: AgentMode
  currentUrl?: string
}
export interface AgentRunResponse {
  ok: boolean
}
export interface AgentStopRequest {
  reason?: string
}

// research:list / research:get / research:delete —— 研究报告
export interface ResearchReportSummary {
  id: number
  query: string
  mode: string
  created_at: number
  length: number
  preview: string
}
export interface ResearchReport {
  id: number
  query: string
  mode: string
  report: string
  created_at: number
}
export interface ResearchListRequest {
  limit?: number
}
export interface ResearchListResponse {
  reports: ResearchReportSummary[]
}
export interface ResearchGetRequest {
  id: number
}
export interface ResearchGetResponse {
  report: ResearchReport | null
}
export interface ResearchDeleteRequest {
  id: number
}
export interface ResearchDeleteResponse {
  success: boolean
}
export interface ResearchExportRequest {
  id: number
}
export interface ResearchExportResponse {
  success: boolean
  path?: string
}

// reviews:get
// reviews:save
export interface ReviewsSaveRequest {
  tradeId: number
  was_reason_valid?: number | null
  did_well?: string | null
  did_wrong?: string | null
  next_time?: string | null
}
export interface ReviewsSaveResponse {
  review: ReviewNote | null
}

// reviews:delete - 只删复盘笔记，保留交易本身
export interface ReviewsDeleteRequest {
  tradeId: number
}
export interface ReviewsDeleteResponse {
  success: boolean
}

// ---------- 笔记类型 ----------

/** 一条对话消息（用户 / AI） */
export interface NoteMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 笔记列表项（不含正文） */
export interface NoteSummary {
  id: number
  title: string
  pin: number // 1 置顶 / 0 否
  updated_at: number
  preview: string
  tags: string[]
}

/** 完整笔记 */
export interface Note {
  id: number
  title: string
  content: string
  pin: number
  created_at: number
  updated_at: number
  chat: NoteMessage[]
  tags: string[]
}

// notes:getAll
export interface NotesGetAllRequest {}
export interface NotesGetAllResponse {
  notes: NoteSummary[]
}
// notes:get
export interface NotesGetRequest {
  id: number
}
export interface NotesGetResponse {
  note: Note | null
}
// notes:save（id 缺省表示新建）
export interface NotesSaveRequest {
  id?: number
  title?: string
  content?: string
  chat?: NoteMessage[]
  pin?: number
  tags?: string[]
  /**
   * 乐观锁基线：调用方读到此笔记时的 updated_at。
   * 服务端发现该笔记已被别处改动（updated_at 不一致）则返回 conflict: true 且不写入，
   * 避免两个面板实例同时编辑同一条笔记互相覆盖。
   */
  baseUpdatedAt?: number
  /** 忽略冲突强制覆盖（用户明确选择「仍要保存」时使用） */
  force?: boolean
}
export interface NotesSaveResponse {
  note: Note
  /** 乐观锁冲突：true 表示服务端检测到该笔记已被别处修改，本次未写入 */
  conflict?: boolean
}
// notes:delete
export interface NotesDeleteRequest {
  id: number
}
export interface NotesDeleteResponse {
  success: boolean
}
// notes:chat - 在当前笔记上下文里与 AI 讨论（或仅基于对话历史）
export interface NotesChatRequest {
  /** 作为背景参考的笔记正文（可选） */
  context?: string
  messages: NoteMessage[]
}
export interface NotesChatResponse {
  reply: string
}
// notes:kbQuery - 把全部笔记当作个人知识库提问
export interface NotesKbQueryRequest {
  question: string
}
export interface NotesKbQueryResponse {
  answer: string
  /** 答案中引用的笔记（后端解析并校验存在性），用于一键跳转 */
  sources: Array<{ id: number; title: string }>
}

// notes:search - 按标题/正文全文搜索笔记（返回摘要列表）
export interface NotesSearchRequest {
  query: string
}
export interface NotesSearchResponse {
  notes: NoteSummary[]
}

// notes:export - 导出单条或全部笔记为 Markdown 文件
export interface NotesExportRequest {
  id?: number // 缺省表示导出全部
}
export interface NotesExportResponse {
  success: boolean
  path?: string
}

// notes:syncDir - 笔记 .md 自动同步目录（只读查询，供前端「打开文件夹」）
export interface NotesSyncDirResponse {
  path: string
}

// notes:updated - 主进程在笔记任何写操作后广播，供多窗口/多实例实时同步
export interface NotesUpdatedEvent {
  /** 新增/更新时带上最新笔记 */
  note?: Note
  /** 删除时带上被删笔记 id */
  deletedId?: number
}

// theme:set - 主题模式（深/浅），主进程据此更新 titleBarOverlay 原生窗口控制按钮配色
export type ThemeMode = 'dark' | 'light'

export interface ThemeSetRequest {
  mode: ThemeMode
}

export interface ThemeGetResponse {
  mode: ThemeMode
}

export interface ThemeUpdatedEvent {
  mode: ThemeMode
}

// shell:open - 用系统打开文件，或在文件管理器中显示其所在文件夹
export interface ShellOpenRequest {
  path: string
  /** true=在文件管理器中显示所在文件夹；false/缺省=用默认程序打开该文件 */
  reveal?: boolean
}
export interface ShellOpenResponse {
  success: boolean
}

// ai:analyzePage - 分析当前活动标签（或指定标签）的页面
export interface AiAnalyzePageRequest {
  tabId?: string
}
export interface AiAnalyzePageResponse {
  result: AiAnalysisView
}

// ai:analyzeText - 分析给定文本（选中文本 / 剪藏）
export interface AiAnalyzeTextRequest {
  text: string
  title?: string
  url?: string
  symbol?: string
}
export interface AiAnalyzeTextResponse {
  result: AiAnalysisView
}

// ai:getHistory - 历史分析记录
export interface AiGetHistoryRequest {
  symbol?: string
  limit?: number
}
export interface AiGetHistoryResponse {
  records: AiAnalysisView[]
}

// ai:deleteRecord
export interface AiDeleteRecordRequest {
  id: number
}
export interface AiDeleteRecordResponse {
  success: boolean
}

// ai:analysisDone - 主进程主动推送（右键菜单分析选中文本的结果）
export interface AiAnalysisDonePayload {
  result: AiAnalysisView | null
  error: string | null
}

// ai:getConfig - 读取 LLM 配置（不下发 apiKey 明文）
export interface AiGetConfigRequest {}
export interface AiGetConfigResponse {
  baseUrl: string
  model: string
  hasApiKey: boolean // 是否已配置 API Key
}

// ai:setConfig
export interface AiSetConfigRequest {
  baseUrl?: string
  apiKey?: string
  model?: string
}
export interface AiSetConfigResponse {
  success: boolean
}

// agent:getCapabilities - 读取 Agent 能力配置
export interface AgentGetCapabilitiesRequest {}
export interface AgentGetCapabilitiesResponse {
  capabilities: AgentCapabilitiesConfig
}

// agent:setCapabilities - 保存 Agent 能力配置
export interface AgentSetCapabilitiesRequest {
  capabilities: AgentCapabilitiesConfig
}
export interface AgentSetCapabilitiesResponse {
  success: boolean
}

// agent:testMcp - 测试 MCP 服务器连通性并列出可用工具
export interface AgentTestMcpRequest {
  server: McpServerConfig
}
export interface AgentTestMcpResponse {
  ok: boolean
  tools: string[]
  error?: string
}

// ---------- IPC 映射表 ----------
export type IpcMapping = {
  [IPC_CHANNELS.PING]: {
    request: PingRequest
    response: PingResponse
  }
  [IPC_CHANNELS.APP_FOCUS_ADDRESS]: {
    request: AppFocusAddressRequest
    response: void
  }
  [IPC_CHANNELS.APP_LOG_TAIL]: {
    request: AppLogTailRequest
    response: AppLogTailResponse
  }
  [IPC_CHANNELS.APP_LOG_OPEN_DIR]: {
    request: AppLogOpenDirRequest
    response: void
  }
  [IPC_CHANNELS.SPACES_GET_ALL]: {
    request: SpacesGetAllRequest
    response: SpacesGetAllResponse
  }
  [IPC_CHANNELS.SPACES_SWITCH]: {
    request: SpacesSwitchRequest
    response: SpacesSwitchResponse
  }
  [IPC_CHANNELS.SPACES_CREATE]: {
    request: SpacesCreateRequest
    response: SpacesCreateResponse
  }
  [IPC_CHANNELS.SPACES_UPDATE]: {
    request: SpacesUpdateRequest
    response: SpacesUpdateResponse
  }
  [IPC_CHANNELS.SPACES_DELETE]: {
    request: SpacesDeleteRequest
    response: SpacesDeleteResponse
  }
  [IPC_CHANNELS.TABS_GET_ALL]: {
    request: TabsGetAllRequest
    response: TabsGetAllResponse
  }
  [IPC_CHANNELS.TABS_GET_ACTIVE]: {
    request: TabsGetActiveRequest
    response: TabsGetActiveResponse
  }
  [IPC_CHANNELS.TABS_CREATE]: {
    request: TabsCreateRequest
    response: TabsCreateResponse
  }
  [IPC_CHANNELS.TABS_CLOSE]: {
    request: TabsCloseRequest
    response: TabsCloseResponse
  }
  [IPC_CHANNELS.TABS_SWITCH]: {
    request: TabsSwitchRequest
    response: TabsSwitchResponse
  }
  [IPC_CHANNELS.TABS_RELOAD]: {
    request: TabsReloadRequest
    response: TabsReloadResponse
  }
  [IPC_CHANNELS.TABS_GO_BACK]: {
    request: TabsGoBackRequest
    response: TabsGoBackResponse
  }
  [IPC_CHANNELS.TABS_GO_FORWARD]: {
    request: TabsGoForwardRequest
    response: TabsGoForwardResponse
  }
  [IPC_CHANNELS.TABS_NAVIGATE]: {
    request: TabsNavigateRequest
    response: TabsNavigateResponse
  }
  [IPC_CHANNELS.TABS_REORDER]: {
    request: TabsReorderRequest
    response: TabsReorderResponse
  }
  [IPC_CHANNELS.TABS_SHOW_CONTEXT_MENU]: {
    request: TabsShowContextMenuRequest
    response: TabsShowContextMenuResponse
  }
  [IPC_CHANNELS.TABS_UPDATED]: {
    request: TabsGetAllResponse // 主进程 -> 渲染进程的推送载荷
    response: void
  }
  [IPC_CHANNELS.BOOKMARKS_GET_ALL]: {
    request: BookmarksGetAllRequest
    response: BookmarksGetAllResponse
  }
  [IPC_CHANNELS.BOOKMARKS_ADD]: {
    request: BookmarksAddRequest
    response: BookmarksAddResponse
  }
  [IPC_CHANNELS.BOOKMARKS_DELETE]: {
    request: BookmarksDeleteRequest
    response: BookmarksDeleteResponse
  }
  [IPC_CHANNELS.BOOKMARKS_UPDATE]: {
    request: BookmarksUpdateRequest
    response: BookmarksUpdateResponse
  }
  [IPC_CHANNELS.BOOKMARKS_REORDER]: {
    request: BookmarksReorderRequest
    response: BookmarksReorderResponse
  }
  [IPC_CHANNELS.BOOKMARK_GROUPS_GET]: {
    request: BookmarkGroupsGetRequest
    response: BookmarkGroupsGetResponse
  }
  [IPC_CHANNELS.BOOKMARK_GROUPS_CREATE]: {
    request: BookmarkGroupsCreateRequest
    response: BookmarkGroupsCreateResponse
  }
  [IPC_CHANNELS.BOOKMARK_GROUPS_UPDATE]: {
    request: BookmarkGroupsUpdateRequest
    response: BookmarkGroupsUpdateResponse
  }
  [IPC_CHANNELS.BOOKMARK_GROUPS_DELETE]: {
    request: BookmarkGroupsDeleteRequest
    response: BookmarkGroupsDeleteResponse
  }
  [IPC_CHANNELS.BOOKMARKS_SET_GROUP]: {
    request: BookmarksSetGroupRequest
    response: BookmarksSetGroupResponse
  }
  [IPC_CHANNELS.STRATEGY_GENERATE]: {
    request: StrategyGenerateRequest
    response: StrategyGenerateResponse
  }
  [IPC_CHANNELS.STRATEGY_SAVE]: {
    request: StrategySaveRequest
    response: StrategySaveResponse
  }
  [IPC_CHANNELS.STRATEGY_LIST]: {
    request: StrategyListRequest
    response: StrategyListResponse
  }
  [IPC_CHANNELS.STRATEGY_GET]: {
    request: StrategyGetRequest
    response: StrategyGetResponse
  }
  [IPC_CHANNELS.STRATEGY_DELETE]: {
    request: StrategyDeleteRequest
    response: StrategyDeleteResponse
  }
  [IPC_CHANNELS.STRATEGY_BACKTEST]: {
    request: StrategyBacktestRequest
    response: StrategyBacktestResponse
  },
  [IPC_CHANNELS.STRATEGY_RUN]: {
    request: StrategyRunRequest
    response: StrategyRunResponse
  },
  [IPC_CHANNELS.STRATEGY_STOP]: {
    request: StrategyStopRequest
    response: StrategyStopResponse
  },
  [IPC_CHANNELS.STRATEGY_STOP_ALL]: {
    request: StrategyStopAllRequest
    response: StrategyStopAllResponse
  },
  [IPC_CHANNELS.STRATEGY_CHECK]: {
    request: StrategyCheckRequest
    response: StrategyCheckResponse
  },
  [IPC_CHANNELS.WATCHLIST_UPDATED]: {
    request: WatchlistUpdateEvent
    response: void
  },
  [IPC_CHANNELS.STRATEGY_STATUS]: {
    request: StrategyStatusRequest
    response: StrategyStatusResponse
  },
  [IPC_CHANNELS.STRATEGY_SIGNALS]: {
    request: StrategySignalsRequest
    response: StrategySignalsResponse
  },
  [IPC_CHANNELS.STRATEGY_SIGNAL]: {
    request: StrategySignal
    response: void
  }
  [IPC_CHANNELS.WINDOW_SET_WEB_AREA_BOUNDS]: {
    request: WindowSetWebAreaBoundsRequest
    response: WindowSetWebAreaBoundsResponse
  }
  [IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN]: {
    request: WindowToggleFullscreenRequest
    response: WindowToggleFullscreenResponse
  }
  [IPC_CHANNELS.WATCHLIST_GET_ALL]: {
    request: WatchlistGetAllRequest
    response: WatchlistGetAllResponse
  }
  [IPC_CHANNELS.WATCHLIST_ADD]: {
    request: WatchlistAddRequest
    response: WatchlistAddResponse
  }
  [IPC_CHANNELS.WATCHLIST_REMOVE]: {
    request: WatchlistRemoveRequest
    response: WatchlistRemoveResponse
  }
  [IPC_CHANNELS.WATCHLIST_REORDER]: {
    request: WatchlistReorderRequest
    response: WatchlistReorderResponse
  }
  [IPC_CHANNELS.WATCHLIST_SEARCH]: {
    request: WatchlistSearchRequest
    response: WatchlistSearchResponse
  }
  [IPC_CHANNELS.WATCHLIST_GROUPS_GET]: {
    request: WatchlistGroupsGetRequest
    response: WatchlistGroupsGetResponse
  }
  [IPC_CHANNELS.WATCHLIST_GROUP_CREATE]: {
    request: WatchlistGroupCreateRequest
    response: WatchlistGroupCreateResponse
  }
  [IPC_CHANNELS.WATCHLIST_GROUP_UPDATE]: {
    request: WatchlistGroupUpdateRequest
    response: WatchlistGroupUpdateResponse
  }
  [IPC_CHANNELS.WATCHLIST_GROUP_DELETE]: {
    request: WatchlistGroupDeleteRequest
    response: WatchlistGroupDeleteResponse
  }
  [IPC_CHANNELS.WATCHLIST_SET_GROUP]: {
    request: WatchlistSetGroupRequest
    response: WatchlistSetGroupResponse
  }
  [IPC_CHANNELS.WATCHLIST_UPDATE]: {
    request: WatchlistUpdateRequest
    response: WatchlistUpdateResponse
  }
  [IPC_CHANNELS.QUOTES_GET_LATEST]: {
    request: QuotesGetLatestRequest
    response: QuotesGetLatestResponse
  }
  [IPC_CHANNELS.QUOTES_REFRESH]: {
    request: QuotesRefreshRequest
    response: QuotesRefreshResponse
  }
  [IPC_CHANNELS.QUOTES_UPDATED]: {
    request: QuotesUpdate
    response: void
  }
  [IPC_CHANNELS.QUOTE_HISTORY_GET]: {
    request: QuoteHistoryGetRequest
    response: QuoteHistoryGetResponse
  }
  [IPC_CHANNELS.PAGE_VISITS_GET_SUMMARY]: {
    request: PageVisitsGetSummaryRequest
    response: PageVisitsGetSummaryResponse
  }
  [IPC_CHANNELS.PAGE_VISITS_GET_BY_STOCK]: {
    request: PageVisitsGetByStockRequest
    response: PageVisitsGetByStockResponse
  }
  [IPC_CHANNELS.PAGE_VISITS_EXPORT]: {
    request: PageVisitsExportRequest
    response: PageVisitsExportResponse
  }
  [IPC_CHANNELS.PAGE_VISITS_DELETE]: {
    request: PageVisitsDeleteRequest
    response: PageVisitsDeleteResponse
  }
  [IPC_CHANNELS.PAGE_VISITS_CLEAR_ALL]: {
    request: PageVisitsClearAllRequest
    response: PageVisitsClearAllResponse
  }
  [IPC_CHANNELS.SETTINGS_GET_TRACKING_ENABLED]: {
    request: SettingsGetTrackingEnabledRequest
    response: SettingsGetTrackingEnabledResponse
  }
  [IPC_CHANNELS.SETTINGS_SET_TRACKING_ENABLED]: {
    request: SettingsSetTrackingEnabledRequest
    response: SettingsSetTrackingEnabledResponse
  }
  [IPC_CHANNELS.SETTINGS_GET_BLACKLIST]: {
    request: SettingsGetBlacklistRequest
    response: SettingsGetBlacklistResponse
  }
  [IPC_CHANNELS.SETTINGS_SET_BLACKLIST]: {
    request: SettingsSetBlacklistRequest
    response: SettingsSetBlacklistResponse
  }
  [IPC_CHANNELS.SETTINGS_GET_TRADING_CALENDAR]: {
    request: SettingsGetTradingCalendarRequest
    response: SettingsGetTradingCalendarResponse
  }
  [IPC_CHANNELS.SETTINGS_SET_TRADING_CALENDAR]: {
    request: SettingsSetTradingCalendarRequest
    response: SettingsSetTradingCalendarResponse
  }
  [IPC_CHANNELS.SETTINGS_GET_SEARCH_ENGINE]: {
    request: SettingsGetSearchEngineRequest
    response: SettingsGetSearchEngineResponse
  }
  [IPC_CHANNELS.SETTINGS_SET_SEARCH_ENGINE]: {
    request: SettingsSetSearchEngineRequest
    response: SettingsSetSearchEngineResponse
  }
  [IPC_CHANNELS.SETTINGS_GET_QUOTE_INTERVAL]: {
    request: SettingsGetQuoteIntervalRequest
    response: SettingsGetQuoteIntervalResponse
  }
  [IPC_CHANNELS.SETTINGS_SET_QUOTE_INTERVAL]: {
    request: SettingsSetQuoteIntervalRequest
    response: SettingsSetQuoteIntervalResponse
  }
  [IPC_CHANNELS.TRADES_GET_ALL]: {
    request: TradesGetAllRequest
    response: TradesGetAllResponse
  }
  [IPC_CHANNELS.TRADES_ADD]: {
    request: TradesAddRequest
    response: TradesAddResponse
  }
  [IPC_CHANNELS.TRADES_UPDATE]: {
    request: TradesUpdateRequest
    response: TradesUpdateResponse
  }
  [IPC_CHANNELS.TRADES_DELETE]: {
    request: TradesDeleteRequest
    response: TradesDeleteResponse
  }
  [IPC_CHANNELS.TRADES_IMPORT_PARSE]: {
    request: TradesImportParseRequest
    response: TradesImportParseResponse
  }
  [IPC_CHANNELS.TRADES_IMPORT_BULK]: {
    request: TradesImportBulkRequest
    response: TradesImportBulkResponse
  }
  [IPC_CHANNELS.REVIEWS_SAVE]: {
    request: ReviewsSaveRequest
    response: ReviewsSaveResponse
  }
  [IPC_CHANNELS.REVIEWS_DELETE]: {
    request: ReviewsDeleteRequest
    response: ReviewsDeleteResponse
  }
  [IPC_CHANNELS.AI_ANALYZE_PAGE]: {
    request: AiAnalyzePageRequest
    response: AiAnalyzePageResponse
  }
  [IPC_CHANNELS.AI_ANALYZE_TEXT]: {
    request: AiAnalyzeTextRequest
    response: AiAnalyzeTextResponse
  }
  [IPC_CHANNELS.AI_GET_HISTORY]: {
    request: AiGetHistoryRequest
    response: AiGetHistoryResponse
  }
  [IPC_CHANNELS.AI_DELETE_RECORD]: {
    request: AiDeleteRecordRequest
    response: AiDeleteRecordResponse
  }
  [IPC_CHANNELS.AI_GET_CONFIG]: {
    request: AiGetConfigRequest
    response: AiGetConfigResponse
  }
  [IPC_CHANNELS.AI_SET_CONFIG]: {
    request: AiSetConfigRequest
    response: AiSetConfigResponse
  }
  [IPC_CHANNELS.AGENT_GET_CAPABILITIES]: {
    request: AgentGetCapabilitiesRequest
    response: AgentGetCapabilitiesResponse
  }
  [IPC_CHANNELS.AGENT_SET_CAPABILITIES]: {
    request: AgentSetCapabilitiesRequest
    response: AgentSetCapabilitiesResponse
  }
  [IPC_CHANNELS.AGENT_TEST_MCP]: {
    request: AgentTestMcpRequest
    response: AgentTestMcpResponse
  }
  [IPC_CHANNELS.AI_ANALYSIS_DONE]: {
    request: AiAnalysisDonePayload // 主进程 -> 渲染进程的推送载荷
    response: void
  }
  [IPC_CHANNELS.WEB_GET_LINKS]: {
    request: WebGetLinksRequest
    response: WebGetLinksResponse
  }
  [IPC_CHANNELS.AGENT_RUN]: {
    request: AgentRunRequest
    response: AgentRunResponse
  }
  [IPC_CHANNELS.ZOOM_CHANGED]: {
    request: ZoomChangedPayload
    response: void
  },
  [IPC_CHANNELS.APP_ZOOM]: {
    request: AppZoomRequest
    response: AppZoomResponse
  },
  [IPC_CHANNELS.AGENT_STREAM]: {
    request: AgentEvent
    response: void
  }
  [IPC_CHANNELS.AGENT_STOP]: {
    request: AgentStopRequest
    response: void
  }
  [IPC_CHANNELS.RESEARCH_LIST]: {
    request: ResearchListRequest
    response: ResearchListResponse
  }
  [IPC_CHANNELS.RESEARCH_GET]: {
    request: ResearchGetRequest
    response: ResearchGetResponse
  }
  [IPC_CHANNELS.RESEARCH_DELETE]: {
    request: ResearchDeleteRequest
    response: ResearchDeleteResponse
  }
  [IPC_CHANNELS.RESEARCH_EXPORT]: {
    request: ResearchExportRequest
    response: ResearchExportResponse
  },
  [IPC_CHANNELS.NOTES_GET_ALL]: {
    request: NotesGetAllRequest
    response: NotesGetAllResponse
  },
  [IPC_CHANNELS.NOTES_GET]: {
    request: NotesGetRequest
    response: NotesGetResponse
  },
  [IPC_CHANNELS.NOTES_SAVE]: {
    request: NotesSaveRequest
    response: NotesSaveResponse
  },
  [IPC_CHANNELS.NOTES_DELETE]: {
    request: NotesDeleteRequest
    response: NotesDeleteResponse
  },
  [IPC_CHANNELS.NOTES_CHAT]: {
    request: NotesChatRequest
    response: NotesChatResponse
  },
  [IPC_CHANNELS.NOTES_KB_QUERY]: {
    request: NotesKbQueryRequest
    response: NotesKbQueryResponse
  },
  [IPC_CHANNELS.NOTES_SEARCH]: {
    request: NotesSearchRequest
    response: NotesSearchResponse
  },
  [IPC_CHANNELS.NOTES_EXPORT]: {
    request: NotesExportRequest
    response: NotesExportResponse
  },
  [IPC_CHANNELS.NOTES_SYNC_DIR]: {
    request: void
    response: NotesSyncDirResponse
  },
  [IPC_CHANNELS.NOTES_UPDATED]: {
    request: NotesUpdatedEvent
    response: void
  },
  [IPC_CHANNELS.THEME_SET]: {
    request: ThemeSetRequest
    response: void
  },
  [IPC_CHANNELS.THEME_GET]: {
    request: void
    response: ThemeGetResponse
  },
  [IPC_CHANNELS.THEME_UPDATED]: {
    request: ThemeUpdatedEvent
    response: void
  },
  [IPC_CHANNELS.SHELL_OPEN]: {
    request: ShellOpenRequest
    response: ShellOpenResponse
  }
}

// 工具类型
export type IpcRequest<C extends IpcChannelName> = IpcMapping[C]['request']
export type IpcResponse<C extends IpcChannelName> = IpcMapping[C]['response']
