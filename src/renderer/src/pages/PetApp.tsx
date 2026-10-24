import { useState, useEffect, useRef, useCallback } from 'react'
import {
  IPC_CHANNELS,
  type AgentEvent,
  type PetConfig,
  type PetNotifyPayload,
} from '@shared/ipc'

/**
 * AI 桌宠（#/pet 路由）
 *
 * 一个浮在桌面上的小跟班：默认只有本体，点一下展开聊天面板（复用 Copilot 的多轮会话）。
 * 主进程通过 pet:notify 推送消息时，它会弹出提示气泡——后续行情监控、
 * 策略信号都可以走这条通道来「让桌宠开口说话」。
 *
 * 注意：这是透明无边框窗口，页面背景必须透明，可交互区域要标 no-drag，
 * 否则拖拽窗口的手势会被输入框吃掉。
 */

// 与 main/browser/pet-window.ts 的 COMPACT_SIZE / CHAT_SIZE 保持一致
const SIZE_COMPACT = { width: 176, height: 190 }
const SIZE_CHAT = { width: 320, height: 460 }

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

let seq = 0
const nextId = () => ++seq

/**
 * 拼身份提示词：先钉死名字（保证「你是谁」能答出名字），再叠加用户自定义人设。
 * 用户没填人设时，只注入名字这一句，避免覆盖模型原本的通用能力设定。
 */
function buildPersona(cfg: PetConfig): string {
  const name = (cfg.name || '牛来').trim()
  const head = `你的名字是「${name}」。被问到「你是谁」「你叫什么名字」时，必须先报出「${name}」这个名字再回答。`
  const custom = (cfg.systemPrompt || '').trim()
  return custom ? `${head}\n${custom}` : head
}

export function PetApp() {
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  // 主进程推送的播报气泡
  const [bubble, setBubble] = useState<(PetNotifyPayload & { id: number }) | null>(null)
  // 桌宠表情：idle / thinking / speaking / alert
  const [mood, setMood] = useState<'idle' | 'thinking' | 'speaking' | 'alert'>('idle')
  // 名字与系统提示词（在「设置 → 牛来」里改）
  const [petConfig, setPetConfig] = useState<PetConfig>({ name: '牛来', systemPrompt: '' })

  const streamingIdRef = useRef<number | null>(null)
  const bubbleTimer = useRef<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  // 只有自己发起的这轮会话才消费流式事件：
  // agent:stream 是全局广播，主窗口跑深度研究时也会推过来，不能让它污染桌宠的状态。
  const activeRef = useRef(false)

  // 透明窗口：把页面背景也置为透明，否则窗口会糊一层主题底色
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  // 载入名字与系统提示词
  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.PET_GET_CONFIG, {})
        setPetConfig(res.config)
      } catch {
        /* 读不到就用默认名字，不影响聊天 */
      }
    })()
  }, [])

  // 订阅主进程的播报推送
  useEffect(() => {
    const off = window.electronAPI.onPetNotify((payload) => {
      setBubble({ ...payload, id: nextId() })
      setMood(payload.level === 'alert' ? 'alert' : 'speaking')
      const ms = payload.durationMs ?? 6000
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current)
      bubbleTimer.current = window.setTimeout(() => {
        setBubble(null)
        setMood('idle')
      }, ms)
    })
    return () => {
      off()
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current)
    }
  }, [])

  // Copilot 流式回复：delta 增量拼接，done 收尾
  useEffect(() => {
    const off = window.electronAPI.onAgentStream((evt: AgentEvent) => {
      // 不是本桌宠发起的会话（比如主窗口在跑深度研究），直接忽略
      if (!activeRef.current) return
      if (evt.type === 'delta') {
        const id = streamingIdRef.current
        if (id == null) return
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: m.content + evt.text } : m))
        )
      } else if (evt.type === 'done') {
        const id = streamingIdRef.current
        if (id != null) {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: evt.report, streaming: false } : m))
          )
        }
        streamingIdRef.current = null
        activeRef.current = false
        setRunning(false)
        setMood('idle')
      } else if (evt.type === 'error') {
        setError(evt.message)
        setRunning(false)
        setMood('idle')
        streamingIdRef.current = null
        activeRef.current = false
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
      } else if (evt.type === 'tool_call') {
        setMood('thinking')
      }
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  // 开合聊天面板：渲染进程改不了 OS 窗口尺寸，交给主进程
  const applySize = useCallback(async (open: boolean) => {
    const s = open ? SIZE_CHAT : SIZE_COMPACT
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.PET_SET_SIZE, {
        width: s.width,
        height: s.height,
      })
    } catch {
      /* 尺寸调整失败不影响聊天 */
    }
  }, [])

  const openChat = async () => {
    setChatOpen(true)
    await applySize(true)
  }

  const closeChat = async () => {
    setChatOpen(false)
    await applySize(false)
  }

  const hidePet = async () => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.PET_TOGGLE, { visible: false })
    } catch {
      /* ignore */
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || running) return
    setError(null)
    const assistantId = nextId()
    streamingIdRef.current = assistantId
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setRunning(true)
    setMood('speaking')
    activeRef.current = true
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_CHAT, {
        sessionId: sessionId ?? undefined,
        message: text,
        // 身份注入：先报名字，再叠加用户在设置里填的人设。
        // 不注入的话模型只会按通用助手人设回答，问「你是谁」就不会提到名字。
        persona: buildPersona(petConfig),
      })
      setSessionId(res.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
      setRunning(false)
      setMood('idle')
      streamingIdRef.current = null
      activeRef.current = false
    }
  }

  /** 停止本轮回复 */
  const stopChat = async () => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AGENT_CHAT_STOP, {})
    } catch {
      /* ignore */
    }
    activeRef.current = false
    streamingIdRef.current = null
    setRunning(false)
    setMood('idle')
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }

  return (
    <div style={styles.root} className="drag-region">
      <style>{PET_CSS}</style>

      {/* 桌宠本体：整块是 drag-region，按住它可以拖动浮窗。
          注意 Electron 会吞掉 drag-region 里的鼠标事件，所以开聊必须用下面的独立按钮。 */}
      <div className="drag-region" style={{ cursor: 'grab' }}>
        <BullMascot size={chatOpen ? 64 : 108} mood={mood} />
      </div>

      {/* 聊天开关（标了 no-drag 才收得到点击） */}
      <button
        className="no-drag"
        onClick={() => (chatOpen ? void closeChat() : void openChat())}
        title={chatOpen ? '收起聊天' : '打开聊天'}
        style={styles.chatToggle}
      >
        {chatOpen ? '收起' : '💬 聊天'}
      </button>

      {/* 播报气泡（行情提示 / 最新回复） */}
      {bubble && (
        <div
          className="no-drag"
          style={{
            ...styles.bubble,
            ...(bubble.level === 'alert' ? styles.bubbleAlert : null),
          }}
        >
          {bubble.text}
        </div>
      )}

      {!chatOpen && !bubble && <div style={styles.hint}>可以拖我</div>}

      {/* 聊天面板 */}
      {chatOpen && (
        <div style={styles.chatWrap}>
          <div className="no-drag" style={styles.chatHeader}>
            <span style={styles.chatTitle}>{petConfig.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn"
                style={styles.miniBtn}
                onClick={() => {
                  setMessages([])
                  setSessionId(null)
                  setError(null)
                }}
                title="清空当前对话"
              >
                清空
              </button>
              <button
                className="btn"
                style={styles.miniBtn}
                onClick={hidePet}
                title="隐藏牛来（唤回：主窗口顶栏 🐮 按钮，或 助手菜单 → 牛来，或 Ctrl/Cmd+Shift+P）"
              >
                隐藏
              </button>
            </div>
          </div>

          <div ref={logRef} className="no-drag" style={styles.log}>
            {messages.length === 0 && !running && (
              <div style={styles.empty}>
                我是{petConfig.name}～ 想聊什么直接说，也可以问我行情、自选股。
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={m.role === 'user' ? styles.msgUser : styles.msgBot}
              >
                {m.content}
                {m.streaming && <span style={styles.caret}>▌</span>}
              </div>
            ))}
          </div>

          {error && <div style={styles.errorBar}>⚠ {error}</div>}

          <div className="no-drag" style={styles.inputRow}>
            <input
              className="field"
              style={styles.input}
              value={input}
              placeholder="说点什么…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            {running ? (
              <button className="btn" style={styles.sendBtn} onClick={() => void stopChat()}>
                停
              </button>
            ) : (
              <button
                className="btn-primary"
                style={styles.sendBtn}
                onClick={() => void send()}
                disabled={!input.trim()}
              >
                发
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 小牛吉祥物（SVG + CSS 动画） */
function BullMascot({
  size,
  mood,
}: {
  size: number
  mood: 'idle' | 'thinking' | 'speaking' | 'alert'
}) {
  const bobClass =
    mood === 'speaking' ? 'pet-bob-fast' : mood === 'alert' ? 'pet-shake' : 'pet-bob'
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: 'block' }}>
      <ellipse cx="60" cy="108" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />
      <g className={bobClass}>
        {/* 角 */}
        <path d="M33 45 C25 34 23 25 30 21 C35 18 41 24 43 31 C45 38 42 43 38 47 Z" fill="#E8C39E" />
        <path d="M87 45 C95 34 97 25 90 21 C85 18 79 24 77 31 C75 38 78 43 82 47 Z" fill="#E8C39E" />
        {/* 耳朵 */}
        <ellipse cx="24" cy="60" rx="11" ry="8" fill="#EFD8C2" transform="rotate(-22 24 60)" />
        <ellipse cx="96" cy="60" rx="11" ry="8" fill="#EFD8C2" transform="rotate(22 96 60)" />
        {/* 头 */}
        <ellipse cx="60" cy="64" rx="38" ry="34" fill="#F6E7D8" />
        {/* 眼睛（会眨） */}
        <g className={mood === 'thinking' ? 'pet-eyes-think' : 'pet-eyes'}>
          <ellipse cx="47" cy="60" rx="5" ry="6" fill="#3B3B45" />
          <ellipse cx="73" cy="60" rx="5" ry="6" fill="#3B3B45" />
          <circle cx="49" cy="58" r="1.6" fill="#fff" />
          <circle cx="75" cy="58" r="1.6" fill="#fff" />
        </g>
        {/* 鼻子 */}
        <ellipse cx="60" cy="78" rx="16" ry="11" fill="#F0C9B0" />
        <ellipse cx="54" cy="78" rx="2.6" ry="3.4" fill="#C98A72" />
        <ellipse cx="66" cy="78" rx="2.6" ry="3.4" fill="#C98A72" />
        {/* 嘴 */}
        <path
          d="M54 86 Q60 90 66 86"
          stroke="#C98A72"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

const PET_CSS = `
@keyframes pet-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes pet-bob-fast { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.02); } }
@keyframes pet-shake { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
@keyframes pet-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
.pet-bob { animation: pet-bob 2.6s ease-in-out infinite; }
.pet-bob-fast { animation: pet-bob-fast 0.9s ease-in-out infinite; }
.pet-shake { animation: pet-shake 0.35s ease-in-out 3; }
.pet-eyes { transform-box: view-box; transform-origin: 60px 60px; animation: pet-blink 4.5s infinite; }
.pet-eyes-think { transform-box: view-box; transform-origin: 60px 60px; animation: pet-blink 1.2s infinite; }
`

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    overflow: 'hidden',
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' },
  chatToggle: {
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(24,24,37,0.9)',
    color: '#e6e6ef',
    cursor: 'pointer',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: 150,
    fontSize: 11.5,
    lineHeight: 1.5,
    padding: '6px 9px',
    borderRadius: 10,
    background: 'rgba(24,24,37,0.92)',
    color: '#e6e6ef',
    border: '1px solid rgba(255,255,255,0.12)',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  bubbleAlert: {
    background: 'rgba(180,40,40,0.92)',
    color: '#fff',
    border: '1px solid rgba(255,120,120,0.5)',
  },
  chatWrap: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: 'rgba(24,24,37,0.94)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  chatTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
  miniBtn: { fontSize: 11, padding: '2px 7px' },
  log: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 0,
  },
  empty: { fontSize: 11.5, color: 'var(--overlay0)', lineHeight: 1.6 },
  msgUser: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    fontSize: 12,
    lineHeight: 1.55,
    padding: '5px 8px',
    borderRadius: 8,
    background: 'rgba(var(--blue-rgb), 0.25)',
    color: 'var(--text)',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  msgBot: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    fontSize: 12,
    lineHeight: 1.55,
    padding: '5px 8px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.07)',
    color: 'var(--text)',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  caret: { opacity: 0.7 },
  errorBar: {
    padding: '5px 8px',
    fontSize: 11.5,
    color: 'var(--red)',
    background: 'rgba(var(--red-rgb), 0.12)',
    flexShrink: 0,
  },
  inputRow: { display: 'flex', gap: 6, padding: 8, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, height: 28, fontSize: 12 },
  sendBtn: { flexShrink: 0, padding: '0 10px', fontSize: 12 },
}
