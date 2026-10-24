import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS, type AgentEvent } from '@shared/ipc'

/** Copilot 面板里展示的一条消息（由会话记录 + 流式增量聚合而成） */
export interface CopilotMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  streaming?: boolean
}

/** 待用户确认的写操作（行动工具） */
export interface CopilotPendingAction {
  requestId: string
  tool: string
  summary: string
}

let msgSeq = 0
function nextId(): string {
  msgSeq += 1
  return `m${Date.now()}-${msgSeq}`
}

/**
 * AI 助手（Copilot）Hook
 * - 订阅主进程 agent:stream 事件：delta 增量拼到当前 assistant 消息，
 *   tool_call/tool_result 渲染为工具轨迹，done 收尾；
 * - 管理会话（新建 / 切换 / 加载历史 / 删除）；
 * - 订阅主进程 Cmd+K 推送（openCopilot 由 App 消费）。
 */
export function useCopilot() {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<
    Array<{ id: number; title: string; updated_at: number; messageCount: number }>
  >([])
  // 行动工具发起、等待用户确认的写操作
  const [pendingAction, setPendingAction] = useState<CopilotPendingAction | null>(null)
  // 流式期间把 delta 累积到哪条消息（避免每个 token 都全量重渲染）
  const streamingIdRef = useRef<string | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_SESSIONS_LIST, {})
      setSessions(res.sessions)
    } catch {
      /* 会话列表失败不打断主流程 */
    }
  }, [])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  // 主进程流式事件
  useEffect(() => {
    const off = window.electronAPI.onAgentStream((evt: AgentEvent) => {
      switch (evt.type) {
        case 'delta': {
          const id = streamingIdRef.current
          if (!id) return
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: m.content + evt.text } : m))
          )
          break
        }
        case 'tool_call': {
          const id = nextId()
          setMessages((prev) => [
            ...prev,
            { id, role: 'tool', content: `🔧 ${evt.name}`, toolName: evt.name },
          ])
          break
        }
        case 'tool_result': {
          const preview = evt.result.length > 200 ? evt.result.slice(0, 200) + ' …' : evt.result
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'tool', content: `↳ ${evt.name}：${preview}`, toolName: evt.name },
          ])
          break
        }
        case 'action_confirm': {
          setPendingAction({ requestId: evt.requestId, tool: evt.tool, summary: evt.summary })
          break
        }
        case 'done': {
          const id = streamingIdRef.current
          if (id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: evt.report, streaming: false } : m))
            )
          }
          streamingIdRef.current = null
          setRunning(false)
          setPendingAction(null)
          void refreshSessions()
          break
        }
        case 'error': {
          setError(evt.message)
          setRunning(false)
          streamingIdRef.current = null
          setPendingAction(null)
          setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
          break
        }
      }
    })
    return off
  }, [refreshSessions])

  /** 发送一条消息（不带 currentUrl，由调用方按需传入） */
  const send = useCallback(
    async (text: string, currentUrl?: string) => {
      const content = text.trim()
      if (!content || running) return
      setError(null)
      setOpen(true)
      const assistantId = nextId()
      streamingIdRef.current = assistantId
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ])
      setRunning(true)
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_CHAT, {
          sessionId: sessionId ?? undefined,
          message: content,
          currentUrl,
        })
        setSessionId(res.sessionId)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setRunning(false)
        streamingIdRef.current = null
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        )
      }
    },
    [running, sessionId]
  )

  const stop = useCallback(async () => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AGENT_CHAT_STOP, {})
    } catch {
      /* ignore */
    }
  }, [])

  /** 回应行动工具的确认请求（确认执行 / 取消） */
  const confirmAction = useCallback(
    async (approved: boolean) => {
      const current = pendingAction
      if (!current) return
      try {
        await window.electronAPI.invoke(IPC_CHANNELS.AGENT_CONFIRM_ACTION, {
          requestId: current.requestId,
          approved,
        })
      } catch {
        /* ignore */
      }
      setPendingAction(null)
    },
    [pendingAction]
  )

  const newSession = useCallback(() => {
    setSessionId(null)
    setMessages([])
    setError(null)
  }, [])

  const loadSession = useCallback(async (id: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_SESSION_GET, { sessionId: id })
      setSessionId(id)
      setError(null)
      setMessages(
        (res.session?.messages ?? [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ id: nextId(), role: m.role as 'user' | 'assistant', content: m.content }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const removeSession = useCallback(
    async (id: number) => {
      try {
        await window.electronAPI.invoke(IPC_CHANNELS.AGENT_SESSION_DELETE, { sessionId: id })
        if (sessionId === id) newSession()
        await refreshSessions()
      } catch {
        /* ignore */
      }
    },
    [sessionId, newSession, refreshSessions]
  )

  return {
    open,
    setOpen,
    messages,
    running,
    error,
    sessions,
    sessionId,
    pendingAction,
    send,
    stop,
    confirmAction,
    newSession,
    loadSession,
    removeSession,
    refreshSessions,
  }
}
