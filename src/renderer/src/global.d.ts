import type {
  IpcChannelName,
  IpcRequest,
  IpcResponse,
  QuotesUpdate,
  TabsGetAllResponse,
  AiAnalysisDonePayload,
  AgentEvent,
  StrategySignal,
  WatchlistUpdateEvent,
  NotesUpdatedEvent,
  ThemeUpdatedEvent,
  ZoomChangedPayload,
} from '@shared/ipc'

declare global {
  interface Window {
    electronAPI: {
      invoke: <C extends IpcChannelName>(
        channel: C,
        request: IpcRequest<C>
      ) => Promise<IpcResponse<C>>
      onQuotesUpdated: (callback: (update: QuotesUpdate) => void) => () => void
      onTabsUpdated: (callback: (payload: TabsGetAllResponse) => void) => () => void
      onFocusAddress: (callback: () => void) => () => void
      onAiAnalysisDone: (callback: (payload: AiAnalysisDonePayload) => void) => () => void
      onAgentStream: (callback: (event: AgentEvent) => void) => () => void
      onStrategySignal: (callback: (signal: StrategySignal) => void) => () => void
      onWatchlistUpdated: (callback: (payload: WatchlistUpdateEvent) => void) => () => void
      onNotesUpdated: (callback: (payload: NotesUpdatedEvent) => void) => () => void
      onThemeUpdated: (callback: (payload: ThemeUpdatedEvent) => void) => () => void
      onZoomChanged: (callback: (payload: ZoomChangedPayload) => void) => () => void
    }
  }
}

export {}
