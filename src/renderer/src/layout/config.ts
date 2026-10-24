/**
 * 布局配置：各区域的职责划分与标签定义
 *
 * 区域划分（VSCode 风格，主区居中，四周可收起）：
 *
 * ```
 * ┌──────────────────────── 顶栏（固定）───────────────────────┐
 * │ 标签栏 + 地址栏 + 布局控制按钮                              │
 * ├────────┬──────────────────────────────────┬───────────────┤
 * │ 主侧栏 │            主区（网页）           │  辅助侧栏      │
 * │ 空间   │        WebContentsView            │  分析/研究/…   │
 * │ 自选股 │                                   │               │
 * ├────────┴──────────────────────────────────┴───────────────┤
 * │ 底部面板：浏览轨迹 / 运行日志                                │
 * └───────────────────────────────────────────────────────────┘
 * ```
 *
 * 尺寸区间与收敛规则在 @shared/layout-metrics（纯逻辑，带单测），这里只放
 * 界面相关的部分：标签定义、持久化 key。
 */

// 尺寸常量统一从共享模块取，避免两边各写一份后又分叉
export { SIDEBAR, PANEL, DOCK, HANDLE_SIZE, WEB_AREA_MIN } from '@shared/layout-metrics'

/**
 * 右侧辅助侧栏的标签（一个面板容器，内部切换内容，不再互相顶掉）
 *
 * 「AI 分析 / 深度研究 / 研究报告」已合并为一个「🔍 研究」标签：
 * 三者本质是同一功能（AI 辅助研究）的三种深度，内部按 快览/深挖/深度研究 分档，
 * 报告库作为该模块的子视图。合并后右侧面板从 9 个标签降为 7 个，降低认知负荷。
 */
export type PanelTab =
  | 'research'
  | 'strategy'
  | 'trades'
  | 'quoteHistory'
  | 'links'
  | 'notes'
  | 'settings'

/** 研究模块的深度分档 */
export type ResearchTier = 'quick' | 'deepen' | 'deep'

/** 研究模块的视图：分档研究 / 报告库 */
export type ResearchView = 'tiers' | 'reports'

/** 底部面板的标签 */
export type DockTab = 'visits' | 'logs'

/** 面板标签定义（图标 + 名称，横向滚动，宽度不够时不会挤成一团） */
export const PANEL_TABS: Array<{ id: PanelTab; icon: string; label: string; title: string }> = [
  { id: 'research', icon: '🔍', label: '研究', title: 'AI 研究（快览 / 深挖 / 深度研究）与报告库' },
  { id: 'strategy', icon: '🤖', label: '策略', title: 'AI 量化策略' },
  { id: 'trades', icon: '📝', label: '复盘', title: '交易记录与复盘' },
  { id: 'quoteHistory', icon: '📊', label: '回放', title: '行情回放' },
  { id: 'links', icon: '📎', label: '链接', title: '本页链接' },
  { id: 'notes', icon: '📒', label: '笔记', title: '笔记（记录 / 与 AI 讨论 / 知识库）' },
  { id: 'settings', icon: '⚙', label: '设置', title: 'AI 设置 / 应用设置' },
]

/** 底部面板标签定义 */
export const DOCK_TABS: Array<{ id: DockTab; icon: string; label: string; title: string }> = [
  { id: 'visits', icon: '🕐', label: '浏览轨迹', title: '按日期/空间查看浏览轨迹' },
  { id: 'logs', icon: '📄', label: '运行日志', title: '应用运行日志（排障用）' },
]

export const LAYOUT_STORAGE_KEY = 'stock-browser.layout.v1'
