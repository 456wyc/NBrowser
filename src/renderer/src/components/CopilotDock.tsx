import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import type { CopilotMessage, CopilotPendingAction } from '../hooks/useCopilot'

/**
 * AI 助手 Copilot 面板
 *
 * 渲染在主区顶部的flex条中（不是 fixed 浮层）——网页是独立 WebContentsView、
 * 盖在 DOM 之上，fixed 居中弹窗会被网页遮住；作为 flex 兄弟节点插入时，
 * 网页区会自然让位，useWebAreaBounds 的 ResizeObserver 会把新矩形同步给主进程。
 */
export function CopilotDock({
  messages,
  running,
  error,
  sessions,
  sessionId,
  pendingAction,
  onSend,
  onStop,
  onConfirmAction,
  onNewSession,
  onLoadSession,
  onDeleteSession,
  onClose,
}: {
  messages: CopilotMessage[]
  running: boolean
  error: string | null
  sessions: Array<{ id: number; title: string; updated_at: number; messageCount: number }>
  sessionId: number | null
  pendingAction: CopilotPendingAction | null
  onSend: (text: string) => void
  onStop: () => void
  onConfirmAction: (approved: boolean) => void
  onNewSession: () => void
  onLoadSession: (id: number) => void
  onDeleteSession: (id: number) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  const submit = () => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    void onSend(text)
  }

  return (
    <div style={styles.container}>
      <div className="panel-header" style={styles.header}>
        <span style={styles.title}>🤖 AI 助手</span>
        <select
          className="chip"
          style={styles.sessionSelect}
          value={sessionId ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v) void onLoadSession(Number(v))
            else onNewSession()
          }}
          title="切换会话"
        >
          <option value="">＋ 新会话</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}（{s.messageCount} 条）
            </option>
          ))}
        </select>
        {sessionId !== null && (
          <button
            className="icon-btn"
            style={styles.headerBtn}
            title="删除当前会话"
            onClick={() => void onDeleteSession(sessionId)}
          >
            🗑
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={styles.hint}>Cmd/Ctrl+K 随时召唤</span>
        <button className="icon-btn" style={styles.headerBtn} title="关闭（Esc）" onClick={onClose}>
          ×
        </button>
      </div>

      <div ref={logRef} style={styles.log}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyTitle}>问我任何事，我认识你的自选股、持仓和研究记录</div>
            <div style={styles.emptyExamples}>
              <span
                style={styles.example}
                onClick={() => setInput('我的自选股今天表现怎么样？')}
              >
                我的自选股今天表现怎么样？
              </span>
              <span style={styles.example} onClick={() => setInput('我最近的持仓盈亏如何？')}>
                我最近的持仓盈亏如何？
              </span>
              <span style={styles.example} onClick={() => setInput('我这周研究了哪些股票？')}>
                我这周研究了哪些股票？
              </span>
              <span
                style={styles.example}
                onClick={() => setInput('帮我查一下贵州茅台最近有什么公告')}
              >
                帮我查一下贵州茅台最近有什么公告
              </span>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {running && messages.every((m) => !m.streaming) && (
          <div style={styles.thinking}>思考中…</div>
        )}
      </div>

      {error && <div style={styles.errorBar}>⚠ {error}</div>}

      {/* 行动工具确认卡片：写操作必须用户放行才执行 */}
      {pendingAction && (
        <div style={styles.confirmBar}>
          <span style={styles.confirmText}>
            🤖 请求执行操作：<b>{pendingAction.summary}</b>
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn" style={styles.confirmBtn} onClick={() => onConfirmAction(false)}>
            取消
          </button>
          <button
            className="btn-primary"
            style={styles.confirmBtn}
            onClick={() => onConfirmAction(true)}
          >
            确认执行
          </button>
        </div>
      )}

      <div style={styles.inputRow}>
        <textarea
          className="textarea"
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape') onClose()
          }}
          placeholder={pendingAction ? '请先回应上方的操作确认请求' : '输入问题，Enter 发送，Shift+Enter 换行'}
          rows={2}
          disabled={!!pendingAction}
        />
        {running ? (
          <button className="btn-danger" style={styles.sendBtn} onClick={onStop}>
            停止
          </button>
        ) : (
          <button
            className="btn-primary"
            style={styles.sendBtn}
            disabled={!input.trim() || !!pendingAction}
            onClick={submit}
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: CopilotMessage }) {
  if (message.role === 'tool') {
    return <div style={styles.toolRow}>{message.content}</div>
  }
  if (message.role === 'user') {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>{message.content}</div>
      </div>
    )
  }
  return (
    <div style={styles.assistantRow}>
      <div style={styles.assistantBubble}>
        {message.content ? (
          <Markdown text={message.content} />
        ) : message.streaming ? (
          <span style={styles.cursor}>▍</span>
        ) : null}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    height: 300,
    background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border)',
  },
  header: {
    height: 36,
    padding: '0 8px 0 12px',
    gap: 6,
  },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  sessionSelect: {
    maxWidth: 180,
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 6,
    background: 'var(--surface0)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
  },
  headerBtn: { width: 26, height: 26, fontSize: 13 },
  hint: { fontSize: 11, color: 'var(--overlay0)' },
  log: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: { padding: '8px 4px' },
  emptyTitle: { fontSize: 13, color: 'var(--subtext0)', marginBottom: 10 },
  emptyExamples: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  example: {
    fontSize: 12,
    color: 'var(--blue)',
    background: 'rgba(var(--blue-rgb), 0.1)',
    border: '1px solid rgba(var(--blue-rgb), 0.25)',
    borderRadius: 14,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  thinking: { fontSize: 12, color: 'var(--overlay0)', fontStyle: 'italic' },
  userRow: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '80%',
    fontSize: 12.5,
    lineHeight: 1.6,
    color: 'var(--text)',
    background: 'var(--surface0)',
    borderRadius: 8,
    padding: '8px 10px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  assistantRow: { display: 'flex' },
  assistantBubble: {
    maxWidth: '92%',
    fontSize: 12.5,
    lineHeight: 1.7,
    color: 'var(--text)',
    background: 'rgba(var(--blue-rgb), 0.06)',
    border: '1px solid rgba(var(--blue-rgb), 0.18)',
    borderRadius: 8,
    padding: '8px 10px',
    wordBreak: 'break-word',
  },
  cursor: { color: 'var(--blue)' },
  toolRow: {
    fontSize: 11,
    color: 'var(--subtext0)',
    background: 'var(--bg-mantle)',
    borderRadius: 6,
    padding: '4px 8px',
    wordBreak: 'break-all',
  },
  errorBar: {
    padding: '6px 12px',
    background: 'rgba(var(--red-rgb), 0.12)',
    color: 'var(--red)',
    fontSize: 12,
  },
  confirmBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(var(--yellow-rgb), 0.1)',
    borderTop: '1px solid rgba(var(--yellow-rgb), 0.35)',
  },
  confirmText: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
  confirmBtn: { flexShrink: 0, height: 28, fontSize: 12 },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: 10,
    borderTop: '1px solid var(--border)',
    alignItems: 'flex-end',
  },
  input: { flex: 1, resize: 'none', fontSize: 12.5 },
  sendBtn: { flexShrink: 0, height: 34 },
}
