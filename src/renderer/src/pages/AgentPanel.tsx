import { useState, useEffect, useRef } from 'react'
import { IPC_CHANNELS, type AgentEvent, type AgentMode } from '@shared/ipc'
import type { Skill } from '@shared/agent-capabilities'
import { Markdown } from '../components/Markdown'

export function AgentPanel() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<AgentMode>('research')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // 展开的工具结果（默认折叠，避免长正文淹没报告）
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [skills, setSkills] = useState<Skill[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  // 最近一份报告（用于复制）
  const doneEvent = [...events]
    .reverse()
    .find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')
  const lastReport = doneEvent?.report ?? ''
  // 已执行的工具调用次数
  const stepCount = events.filter((e) => e.type === 'tool_call').length

  useEffect(() => {
    const off = window.electronAPI.onAgentStream((evt) => {
      setEvents((prev) => [...prev, evt])
      if (evt.type === 'done' || evt.type === 'error') setRunning(false)
      if (evt.type === 'error') setError(evt.message)
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [events])

  // 载入可一键调用的分析模板
  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_GET_CAPABILITIES, {})
        setSkills(res.capabilities.skills || [])
      } catch {
        /* 忽略：无模板时不影响研究 */
      }
    })()
  }, [])

  const applySkill = (skill: Skill) => {
    const q = query.trim()
    setQuery(q ? skill.prompt.replace(/\{query\}/g, q) : skill.prompt)
  }

  const handleRun = async () => {
    const q = query.trim()
    if (!q || running) return
    setEvents([])
    setError(null)
    setRunning(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AGENT_RUN, { query: q, mode })
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动研究失败')
      setRunning(false)
    }
  }

  const handleStop = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.AGENT_STOP, {})
    setRunning(false)
  }

  // 复制报告全文
  const handleCopy = async () => {
    if (!lastReport) return
    try {
      await navigator.clipboard.writeText(lastReport)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // 清空当前研究过程（不删已落库的报告）
  const handleClear = () => {
    setEvents([])
    setError(null)
    setCopied(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.inputArea}>
        <div style={styles.titleRow}>
          <span style={styles.title}>AI 深度研究</span>
          {stepCount > 0 && (
            <span style={styles.stepBadge}>
              {stepCount} 次工具调用
            </span>
          )}
        </div>
        <textarea
          className="textarea"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：分析 600519 贵州茅台近期公告与舆情，提炼关键风险点"
          rows={3}
          style={{ resize: 'none' }}
        />
        <div style={styles.modeRow}>
          {/* 模式二选一：与行情回放等处一致，用分段按钮而不是原生 radio */}
          <div style={styles.modeSeg}>
            <button
              className={'seg-btn' + (mode === 'research' ? ' active' : '')}
              onClick={() => setMode('research')}
              title="就研究目标自主检索与推理"
            >
              自主研究
            </button>
            <button
              className={'seg-btn' + (mode === 'deepen' ? ' active' : '')}
              onClick={() => setMode('deepen')}
              title="围绕当前打开的页面继续深挖"
            >
              深挖当前页
            </button>
          </div>
          <div style={styles.spacer} />
          {events.length > 0 && !running && (
            <button onClick={handleClear} className="btn" title="清空当前研究过程">
              清空
            </button>
          )}
          {running ? (
            <button onClick={handleStop} className="btn-danger">
              停止
            </button>
          ) : (
            <button onClick={handleRun} className="btn-primary" disabled={!query.trim()}>
              开始研究
            </button>
          )}
        </div>
        {skills.length > 0 && (
          <div style={styles.skillsRow}>
            <span style={styles.skillsLabel}>模板</span>
            {skills.map((s) => (
              <button key={s.id} className="chip" onClick={() => applySkill(s)} title={s.description}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={styles.errorBar}>⚠ {error}</div>
      )}

      <div ref={logRef} style={styles.log}>
        {events.length === 0 && !running && (
          <div style={styles.empty}>输入目标后点击「开始研究」，代理会自主联网检索、阅读、综合并生成报告。</div>
        )}
        {events.map((evt, i) => (
          <EventView
            key={i}
            index={i}
            evt={evt}
            onCopy={handleCopy}
            copied={copied}
            expanded={expanded.has(i)}
            onToggle={() =>
              setExpanded((cur) => {
                const next = new Set(cur)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
          />
        ))}
        {running && (
          <div style={styles.thinking}>
            代理研究中…{stepCount > 0 ? `（已执行 ${stepCount} 次工具调用）` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function EventView({
  evt,
  onCopy,
  copied,
  index,
  expanded,
  onToggle,
}: {
  evt: AgentEvent
  onCopy: () => void
  copied: boolean
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  if (evt.type === 'thought') {
    return (
      <div style={styles.thought}>
        <Markdown text={evt.text} />
      </div>
    )
  }
  if (evt.type === 'tool_call') {
    return (
      <div style={styles.toolCall}>
        🔧 {evt.name}
        <code style={styles.toolArgs}>{JSON.stringify(evt.args)}</code>
      </div>
    )
  }
  if (evt.type === 'tool_result') {
    // 默认只展示摘要，点击可展开全文，避免长正文把报告挤到很下面
    const preview = evt.result.slice(0, 160)
    const long = evt.result.length > 160
    return (
      <div style={styles.toolResult}>
        <button onClick={onToggle} style={styles.toolResultHeader} title="展开/收起">
          ↳ {evt.name} 结果{long ? (expanded ? '（收起）' : '（展开）') : ''}
        </button>
        <pre style={styles.toolResultText}>
          {expanded ? evt.result : preview + (long ? ' …' : '')}
        </pre>
      </div>
    )
  }
  if (evt.type === 'done') {
    return (
      <div style={styles.report}>
        <div style={styles.reportTitle}>
          <span>研究报告</span>
          <button
            onClick={onCopy}
            className="btn"
            title="复制报告全文"
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
        <div style={styles.reportText}>
          <Markdown text={evt.report} />
        </div>
      </div>
    )
  }
  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  inputArea: { padding: 12, borderBottom: '1px solid var(--border)', flexShrink: 0 },
  skillsRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  skillsLabel: { fontSize: 11, color: 'var(--overlay0)', marginRight: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  stepBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
  },
  modeRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 },
  modeSeg: { display: 'flex', gap: 4, flexShrink: 0 },
  spacer: { flex: 1 },
  errorBar: { padding: '8px 12px', background: 'rgba(var(--red-rgb), 0.12)', color: 'var(--red)', fontSize: 12 },
  log: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { color: 'var(--overlay0)', fontSize: 12.5, lineHeight: 1.7, padding: 16 },
  thinking: { color: 'var(--overlay0)', fontSize: 12, fontStyle: 'italic' },
  thought: {
    fontSize: 12.5,
    color: 'var(--text)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    background: 'var(--surface0)',
    padding: '8px 10px',
    borderRadius: 6,
  },
  toolCall: {
    fontSize: 12,
    color: 'var(--blue)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolArgs: { color: 'var(--subtext0)', fontSize: 11, wordBreak: 'break-all' },
  toolResult: { fontSize: 11.5, color: 'var(--subtext0)' },
  toolResultHeader: {
    border: 'none',
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 11.5,
    padding: 0,
    textAlign: 'left',
  },
  toolResultText: {
    margin: '4px 0 0',
    maxHeight: 160,
    overflow: 'auto',
    background: 'var(--bg-base)',
    padding: 8,
    borderRadius: 6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  report: {
    marginTop: 4,
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    background: 'var(--bg-base)',
    overflow: 'hidden',
  },
  reportTitle: {
    padding: '6px 12px',
    background: 'var(--surface0)',
    color: 'var(--blue)',
    fontSize: 12.5,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reportText: {
    margin: 0,
    padding: 12,
    fontSize: 12.5,
    color: 'var(--text)',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 480,
    overflow: 'auto',
  },
}
