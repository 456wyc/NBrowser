import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type IpcRequest,
  type IpcResponse,
  type IpcChannelName,
  type QuotesUpdate,
  type TabsGetAllResponse,
  type AiAnalysisDonePayload,
  type AgentEvent,
  type PageAgentEvent,
  type PetNotifyPayload,
  type StrategySignal,
  type WatchlistUpdateEvent,
  type NotesUpdatedEvent,
  type ThemeUpdatedEvent,
  type ZoomChangedPayload,
  type WindowsGetAllResponse,
  type WindowsGetTabsResponse,
} from '@shared/ipc'

/**
 * 安全的 IPC 调用封装
 * 只暴露白名单内的通道，渲染进程只能调用这里定义的方法。
 */
const api = {
  /**
   * 调用 IPC 通道（渲染进程 -> 主进程，请求-响应模式）
   */
  invoke: <C extends IpcChannelName>(
    channel: C,
    request: IpcRequest<C>
  ): Promise<IpcResponse<C>> => {
    const allowedChannels = Object.values(IPC_CHANNELS) as string[]
    if (!allowedChannels.includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, request)
  },

  /**
   * 监听行情更新（主进程主动推送）
   * 返回取消监听的函数
   */
  onQuotesUpdated: (callback: (update: QuotesUpdate) => void): (() => void) => {
    const handler = (_event: unknown, update: QuotesUpdate) => callback(update)
    ipcRenderer.on(IPC_CHANNELS.QUOTES_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.QUOTES_UPDATED, handler)
    }
  },

  /**
   * 监听标签列表变化（主进程主动推送）
   * 返回取消监听的函数
   */
  onTabsUpdated: (callback: (payload: TabsGetAllResponse) => void): (() => void) => {
    const handler = (_event: unknown, payload: TabsGetAllResponse) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.TABS_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TABS_UPDATED, handler)
    }
  },

  /**
   * 监听「聚焦地址栏」指令（由主进程菜单触发）
   * 返回取消监听的函数
   */
  onFocusAddress: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_FOCUS_ADDRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP_FOCUS_ADDRESS, handler)
    }
  },

  /**
   * 监听「召唤 AI 助手」指令（由主进程菜单 Cmd/Ctrl+K 触发）
   * 返回取消监听的函数
   */
  onCopilotOpen: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.AGENT_COPILOT_OPEN, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_COPILOT_OPEN, handler)
    }
  },

  /**
   * 监听分析结果（右键菜单「整理选中文本」完成后由主进程推送）
   * 返回取消监听的函数
   */
  onAiAnalysisDone: (callback: (payload: AiAnalysisDonePayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: AiAnalysisDonePayload) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.AI_ANALYSIS_DONE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AI_ANALYSIS_DONE, handler)
    }
  },

  /**
   * 监听深度研究代理的流式事件（思考 / 工具调用 / 结果 / 完成）
   * 返回取消监听的函数
   */
  onAgentStream: (callback: (event: AgentEvent) => void): (() => void) => {
    const handler = (_event: unknown, event: AgentEvent) => callback(event)
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM, handler)
    }
  },

  /**
   * 监听策略运行态的买卖点信号（主进程主动推送）
   * 返回取消监听的函数
   */
  onStrategySignal: (callback: (signal: StrategySignal) => void): (() => void) => {
    const handler = (_event: unknown, signal: StrategySignal) => callback(signal)
    ipcRenderer.on(IPC_CHANNELS.STRATEGY_SIGNAL, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STRATEGY_SIGNAL, handler)
    }
  },

  /**
   * 监听桌宠的提示播报（行情监控 / 策略信号等由主进程推送）
   * 返回取消监听的函数
   */
  onPetNotify: (callback: (payload: PetNotifyPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: PetNotifyPayload) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.PET_NOTIFY, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PET_NOTIFY, handler)
    }
  },

  /**
   * 监听页面智能体的步骤流（感知 / 动作 / 完成 / 错误）
   * 返回取消监听的函数
   */
  onPageAgentEvent: (callback: (event: PageAgentEvent) => void): (() => void) => {
    const handler = (_event: unknown, event: PageAgentEvent) => callback(event)
    ipcRenderer.on(IPC_CHANNELS.PAGE_AGENT_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PAGE_AGENT_EVENT, handler)
    }
  },

  /**
   * 监听自选股变化（任何写操作后由主进程广播最新列表与分组）
   * 返回取消监听的函数
   */
  /**
   * 监听缩放比例变化（菜单快捷键 / 站点记忆恢复时由主进程推送）
   * 返回取消监听的函数
   */
  onZoomChanged: (callback: (payload: ZoomChangedPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: ZoomChangedPayload) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.ZOOM_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ZOOM_CHANGED, handler)
    }
  },

  onWatchlistUpdated: (callback: (payload: WatchlistUpdateEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: WatchlistUpdateEvent) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.WATCHLIST_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WATCHLIST_UPDATED, handler)
    }
  },

  onNotesUpdated: (callback: (payload: NotesUpdatedEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: NotesUpdatedEvent) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.NOTES_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTES_UPDATED, handler)
    }
  },

  /**
   * 监听独立窗口列表变化（弹出 / 收回 / 页面标题变化时由主进程推送）
   * 返回取消监听的函数
   */
  onPopoutWindowsUpdated: (
    callback: (payload: WindowsGetAllResponse) => void
  ): (() => void) => {
    const handler = (_event: unknown, payload: WindowsGetAllResponse) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.WINDOWS_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOWS_UPDATED, handler)
    }
  },

  /**
   * 监听「本独立窗口内的标签列表」变化（外壳用；由主进程推到对应窗口）
   * 返回取消监听的函数
   */
  onPopoutTabsUpdated: (
    callback: (payload: WindowsGetTabsResponse) => void
  ): (() => void) => {
    const handler = (_event: unknown, payload: WindowsGetTabsResponse) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.WINDOWS_TABS_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOWS_TABS_UPDATED, handler)
    }
  },

  onThemeUpdated: (callback: (payload: ThemeUpdatedEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: ThemeUpdatedEvent) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.THEME_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.THEME_UPDATED, handler)
    }
  },
}

/**
 * 判断当前页面是否为应用自身的页面
 *
 * preload 会被注入到每一个 WebContentsView（因为导航首页需要在标签里调用 IPC），
 * 因此必须做来源校验：只对本机页面暴露 API，外部网站一律不暴露，
 * 避免任意站点越权调用 IPC（删除书签、读取配置等）。
 * 跨源导航一定会重建文档并重新执行 preload，所以该校验始终有效。
 */
function isAppOrigin(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') {
      // 应用自身页面位于 out/renderer 下
      return u.pathname.includes('renderer')
    }
    // 开发模式的 dev server
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin)
  } catch {
    return false
  }
}

if (isAppOrigin(location.href)) {
  contextBridge.exposeInMainWorld('electronAPI', api)
}

// 类型声明，供渲染进程使用
export type ElectronAPI = typeof api
