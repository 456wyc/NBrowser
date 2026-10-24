import { useState, useEffect, useRef } from 'react'
import { IPC_CHANNELS, type PageAgentEvent } from '@shared/ipc'

/**
 * 页面智能体 UI（最小 PoC）
 * 输入一句话目标，调用主进程的 PAGE_AGENT_START，监听 PAGE_AGENT_EVENT 回传的步骤流。
 * 操作对象是「当前活动标签页」打开的网页。
 */
export function PageAgentPanel() {
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<PageAgentEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.electronAPI.onPageAgentEvent((evt) => {
      setSteps((prev) => [...prev, evt])
      if (evt.type === 'done' || evt.type === 'error') setRunning(false)
      if (evt.type === 'error') setError(evt.message || '执行出错')
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [steps])

  const handleRun = async () => {
    const g = goal.trim()
    if (!g || running) return
    setSteps([])
    setError(null)
    setRunning(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.PAGE_AGENT_START, { goal: g, maxSteps: 10 })
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败')
      setRunning(false)
    }
  }

  const handleStop = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.PAGE_AGENT_STOP, {})
    setRunning(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.inputArea}>
        <div style={styles.title}>🤖 页面智能体（大模型自动控制当前标签页）</div>
        <textarea
          className="textarea"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="例如：在搜索框输入「贵州茅台」，点击搜索按钮，并打开第一条结果"
          rows={3}
          style={{ resize: 'none' }}
        />
        <div style={styles.modeRow}>
          <div style={styles.spacer} />
          {running ? (
            <button onClick={handleStop} className="btn-danger">
              停止
            </button>
          ) : (
            <button onClick={handleRun} className="btn-primary" disabled={!goal.trim()}>
              开始执行
            </button>
          )}
        </div>
        <div style={styles.hint}>
          操作的是「当前活动标签页」的网页。每步会读取页面可见元素，让模型决策点击 / 输入 / 滚动 / 导航。
          涉及登录态或验证码的页面可能中断，请人工接管。
        </div>
      </div>

      {error && <div style={styles.errorBar}>⚠ {error}</div>}

      <div ref={logRef} style={styles.log}>
        {steps.length === 0 && !running && (
          <div style={styles.empty}>
            输入目标后点击「开始执行」，智能体会逐步操作网页，并回传每一步的感知与动作。
          </div>
        )}
        {steps.map((s, i) => (
          <StepView key={i} s={s} />
        ))}
        {running && <div style={styles.thinking}>智能体执行中…</div>}
      </div>
    </div>
  )
}

function StepView({ s }: { s: PageAgentEvent }) {
  if (s.type === 'perceive') {
    return (
      <div style={styles.perceive}>
        👁 第 {s.step} 步：感知页面，发现 {s.elementsCount} 个可交互元素
      </div>
    )
  }
  if (s.type === 'action') {
    return (
      <div style={styles.action}>
        🦾 第 {s.step} 步：<b>{s.action}</b>
        {s.target ? ` #${s.target}` : ''}
        {s.thought ? <div style={styles.thought}>💭 {s.thought}</div> : null}
        <div style={styles.result}>→ {s.result}</div>
      </div>
    )
  }
  if (s.type === 'done') {
    return (
      <div style={styles.done}>
        ✅ 完成（{s.finalUrl}）
        {s.answer ? <div style={styles.answer}>{s.answer}</div> : null}
      </div>
    )
  }
  if (s.type === 'error') {
    return <div style={styles.error}>⚠ {s.message}</div>
  }
  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  inputArea: { padding: 12, borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 },
  modeRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 },
  spacer: { flex: 1 },
  hint: {
    marginTop: 8,
    fontSize: 11.5,
    color: 'var(--overlay0)',
    lineHeight: 1.6,
  },
  errorBar: {
    padding: '8px 12px',
    background: 'rgba(var(--red-rgb), 0.12)',
    color: 'var(--red)',
    fontSize: 12,
  },
  log: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: { color: 'var(--overlay0)', fontSize: 12.5, lineHeight: 1.7, padding: 16 },
  thinking: { color: 'var(--overlay0)', fontSize: 12, fontStyle: 'italic' },
  perceive: {
    fontSize: 12,
    color: 'var(--subtext0)',
    background: 'var(--surface0)',
    padding: '6px 10px',
    borderRadius: 6,
  },
  action: {
    fontSize: 12.5,
    color: 'var(--text)',
    background: 'var(--surface0)',
    padding: '8px 10px',
    borderRadius: 6,
    lineHeight: 1.6,
  },
  thought: { color: 'var(--subtext0)', fontSize: 11.5, marginTop: 2 },
  result: { color: 'var(--blue)', fontSize: 11.5, marginTop: 2, wordBreak: 'break-all' },
  done: {
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  answer: {
    padding: 12,
    fontSize: 12.5,
    color: 'var(--text)',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 480,
    overflow: 'auto',
  },
  error: {
    padding: '8px 10px',
    background: 'rgba(var(--red-rgb), 0.1)',
    color: 'var(--red)',
    fontSize: 12,
    borderRadius: 6,
  },
}
