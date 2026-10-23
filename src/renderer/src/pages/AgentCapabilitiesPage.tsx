import { useState, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  BUILTIN_TOOL_NAMES,
  type AgentCapabilitiesConfig,
  type CustomTool,
  type Skill,
  type McpServerConfig,
} from '@shared/agent-capabilities'
import { useToast } from '../hooks/useToast'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function parseArgs(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}
function parseEnv(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of s.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}
function envToText(env?: Record<string, string>): string {
  return Object.entries(env || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

export function AgentCapabilitiesPage() {
  const [cap, setCap] = useState<AgentCapabilitiesConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()
  const [testStates, setTestStates] = useState<
    Record<string, { loading?: boolean; ok?: boolean; tools?: string[]; error?: string }>
  >({})

  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_GET_CAPABILITIES, {})
        setCap(res.capabilities)
      } catch (err) {
        showToast(err instanceof Error ? err.message : '加载失败', false)
      }
    })()
  }, [])

  if (!cap) return <div style={styles.loading}>{toast?.text || '加载中…'}</div>

  const save = async () => {
    setSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AGENT_SET_CAPABILITIES, { capabilities: cap })
      showToast('已保存')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  const testMcp = async (id: string) => {
    const srv = cap?.mcpServers.find((m) => m.id === id)
    if (!srv) return
    setTestStates((p) => ({ ...p, [id]: { loading: true } }))
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_TEST_MCP, { server: srv })
      setTestStates((p) => ({ ...p, [id]: { ok: res.ok, tools: res.tools, error: res.error } }))
    } catch (err) {
      setTestStates((p) => ({
        ...p,
        [id]: { ok: false, error: err instanceof Error ? err.message : '测试失败' },
      }))
    }
  }

  // ---- 更新助手 ----
  const patchBuiltin = (name: string, patch: Partial<{ enabled: boolean; description?: string }>) => {
    setCap((c) => {
      if (!c) return c
      const cur = c.builtinTools[name] || { enabled: true }
      const next = { ...cur, ...patch }
      if (next.description === '') next.description = undefined
      return { ...c, builtinTools: { ...c.builtinTools, [name]: next } }
    })
  }
  const patchCustom = (id: string, patch: Partial<CustomTool>) =>
    setCap((c) => c && { ...c, customTools: c.customTools.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  const addCustom = () =>
    setCap((c) =>
      c && {
        ...c,
        customTools: [
          ...c.customTools,
          { id: uid(), name: 'new_tool', description: '', kind: 'url', urlTemplate: '' },
        ],
      }
    )
  const removeCustom = (id: string) =>
    setCap((c) => c && { ...c, customTools: c.customTools.filter((t) => t.id !== id) })

  const patchSkill = (id: string, patch: Partial<Skill>) =>
    setCap((c) => c && { ...c, skills: c.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const addSkill = () =>
    setCap((c) =>
      c && {
        ...c,
        skills: [
          ...c.skills,
          { id: uid(), name: '新分析模板', description: '', prompt: '针对「{query}」完成以下分析：\n1. …\n2. …' },
        ],
      }
    )
  const removeSkill = (id: string) =>
    setCap((c) => c && { ...c, skills: c.skills.filter((s) => s.id !== id) })

  const patchMcp = (id: string, patch: Partial<McpServerConfig>) =>
    setCap((c) => c && { ...c, mcpServers: c.mcpServers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const addMcp = () =>
    setCap((c) =>
      c && {
        ...c,
        mcpServers: [
          ...c.mcpServers,
          { id: uid(), name: 'new-mcp', enabled: false, transport: 'stdio', command: '', args: [], env: {} },
        ],
      }
    )
  const removeMcp = (id: string) =>
    setCap((c) => c && { ...c, mcpServers: c.mcpServers.filter((m) => m.id !== id) })

  const enabledBuiltinCount = BUILTIN_TOOL_NAMES.filter(
    (n) => (cap!.builtinTools[n]?.enabled ?? true) !== false
  ).length

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Agent 能力</h2>
      <p className="muted" style={styles.subtitle}>
        管理深度研究代理可用的工具、分析模板与外部 MCP 服务器。修改后点击底部「保存」生效。
      </p>

      <div style={styles.summary}>
        <span style={styles.summaryItem}>
          内置工具 <b>{enabledBuiltinCount}</b>/{BUILTIN_TOOL_NAMES.length}
        </span>
        <span style={styles.summaryItem}>
          自定义工具 <b>{cap.customTools.length}</b>
        </span>
        <span style={styles.summaryItem}>
          分析模板 <b>{cap.skills.length}</b>
        </span>
        <span style={styles.summaryItem}>
          MCP <b>{cap.mcpServers.filter((m) => m.enabled).length}</b>/{cap.mcpServers.length}
        </span>
      </div>

      {/* 内置工具 */}
      <Section title="内置工具" desc="勾选是否向模型开放；可覆盖工具描述以引导使用方式。">
        <div style={styles.list}>
          {BUILTIN_TOOL_NAMES.map((name) => {
            const ov = cap.builtinTools[name] || { enabled: true }
            return (
              <div key={name} style={styles.rowCard}>
                <label style={styles.rowHead} className="switch">
                  <input
                    type="checkbox"
                    checked={ov.enabled !== false}
                    onChange={(e) => patchBuiltin(name, { enabled: e.target.checked })}
                  />
                  <span className="switch-track" />
                  <code style={styles.code}>{name}</code>
                </label>
                <input
                  className="field"
                  style={styles.flex1}
                  placeholder="工具描述（留空用默认）"
                  value={ov.description || ''}
                  onChange={(e) => patchBuiltin(name, { description: e.target.value })}
                />
              </div>
            )
          })}
        </div>
      </Section>

      {/* 自定义工具 */}
      <Section
        title="自定义工具"
        desc="url：把查询词拼进 URL 模板（用 {query} 占位）后无头抓取；prompt：调用时返回固定指令。"
        action={{ label: '+ 添加', onClick: addCustom }}
      >
        <div style={styles.list}>
          {cap.customTools.length === 0 && <Empty text="暂无自定义工具" />}
          {cap.customTools.map((t) => (
            <div key={t.id} style={styles.rowCard}>
              <div style={styles.rowTop}>
                <input
                  className="field"
                  style={{ width: 140 }}
                  value={t.name}
                  onChange={(e) => patchCustom(t.id, { name: e.target.value })}
                />
                <select
                  className="field"
                  style={{ width: 90 }}
                  value={t.kind}
                  onChange={(e) => patchCustom(t.id, { kind: e.target.value as CustomTool['kind'] })}
                >
                  <option value="url">url</option>
                  <option value="prompt">prompt</option>
                </select>
                <input
                  className="field"
                  style={styles.flex1}
                  placeholder="描述"
                  value={t.description}
                  onChange={(e) => patchCustom(t.id, { description: e.target.value })}
                />
                <button className="btn btn-danger" style={styles.delBtn} onClick={() => removeCustom(t.id)}>
                  删除
                </button>
              </div>
              {t.kind === 'url' ? (
                <input
                  className="field"
                  placeholder="URL 模板，例如 https://example.com/s?q={query}"
                  value={t.urlTemplate || ''}
                  onChange={(e) => patchCustom(t.id, { urlTemplate: e.target.value })}
                />
              ) : (
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="指令内容（模型调用该工具时返回）"
                  value={t.prompt || ''}
                  onChange={(e) => patchCustom(t.id, { prompt: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Skills */}
      <Section
        title="分析模板（Skills）"
        desc="可复用的分析工作流。在「AI 深度研究」面板点击对应模板即可一键填入提示词。"
        action={{ label: '+ 添加', onClick: addSkill }}
      >
        <div style={styles.list}>
          {cap.skills.length === 0 && <Empty text="暂无分析模板" />}
          {cap.skills.map((s) => (
            <div key={s.id} style={styles.rowCard}>
              <div style={styles.rowTop}>
                <input
                  className="field"
                  style={{ width: 140 }}
                  value={s.name}
                  onChange={(e) => patchSkill(s.id, { name: e.target.value })}
                />
                <input
                  className="field"
                  style={styles.flex1}
                  placeholder="一句话说明适用场景"
                  value={s.description}
                  onChange={(e) => patchSkill(s.id, { description: e.target.value })}
                />
                <button className="btn btn-danger" style={styles.delBtn} onClick={() => removeSkill(s.id)}>
                  删除
                </button>
              </div>
              <textarea
                className="textarea"
                rows={3}
                placeholder="分析提示词（可用 {query} 占位股票/问题）"
                value={s.prompt}
                onChange={(e) => patchSkill(s.id, { prompt: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* MCP */}
      <Section
        title="MCP 服务器"
        desc="接入外部 MCP 服务器，自动拉取其工具并桥接给代理（当前仅支持 stdio 传输）。"
        action={{ label: '+ 添加', onClick: addMcp }}
      >
        <div style={styles.list}>
          {cap.mcpServers.length === 0 && <Empty text="暂无 MCP 服务器" />}
          {cap.mcpServers.map((m) => (
            <div key={m.id} style={styles.rowCard}>
              <div style={styles.rowTop}>
                <label style={styles.rowHead} className="switch">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => patchMcp(m.id, { enabled: e.target.checked })}
                  />
                  <span className="switch-track" />
                  <input
                    className="field"
                    style={styles.flex1}
                    placeholder="服务器名称"
                    value={m.name || ''}
                    onChange={(e) => patchMcp(m.id, { name: e.target.value })}
                  />
                </label>
                <button
                  className="btn"
                  style={styles.testBtn}
                  onClick={() => testMcp(m.id)}
                  disabled={testStates[m.id]?.loading}
                >
                  {testStates[m.id]?.loading ? '测试中…' : '测试连接'}
                </button>
                <button className="btn btn-danger" style={styles.delBtn} onClick={() => removeMcp(m.id)}>
                  删除
                </button>
              </div>
              <div style={styles.grid2}>
                <div style={styles.fieldCol}>
                  <label style={styles.fieldLabel}>启动命令</label>
                  <input
                    className="field"
                    placeholder="例如 npx"
                    value={m.command || ''}
                    onChange={(e) => patchMcp(m.id, { command: e.target.value })}
                  />
                </div>
                <div style={styles.fieldCol}>
                  <label style={styles.fieldLabel}>参数（逗号分隔）</label>
                  <input
                    className="field"
                    placeholder="例如 -y, @modelcontextprotocol/server-filesystem, /data"
                    value={(m.args || []).join(', ')}
                    onChange={(e) => patchMcp(m.id, { args: parseArgs(e.target.value) })}
                  />
                </div>
                <div style={{ ...styles.fieldCol, gridColumn: '1 / -1' }}>
                  <label style={styles.fieldLabel}>环境变量（每行 KEY=VALUE）</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={envToText(m.env)}
                    onChange={(e) => patchMcp(m.id, { env: parseEnv(e.target.value) })}
                  />
                </div>
              </div>
              {testStates[m.id] && (
                <div style={styles.testStatus}>
                  {testStates[m.id]!.loading ? (
                    <span className="muted">正在连接…</span>
                  ) : testStates[m.id]!.ok ? (
                    <span style={{ color: 'var(--green)' }}>
                      连接成功，拉到 {testStates[m.id]!.tools?.length ?? 0} 个工具：
                      {(testStates[m.id]!.tools || []).join('、')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--red)' }}>连接失败：{testStates[m.id]!.error}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <div style={styles.footer}>
        <button className="btn-primary" style={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        {toast && (
          <span className={toast.ok ? 'toast' : 'toast-error'}>{toast.text}</span>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string
  desc: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div className="card" style={styles.section}>
      <div style={styles.sectionHead}>
        <div style={styles.sectionHeadText}>
          <div style={styles.sectionTitle}>{title}</div>
          <div className="muted" style={styles.sectionDesc}>
            {desc}
          </div>
        </div>
        {action && (
          <button className="btn" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="muted" style={styles.empty}>
      {text}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '16px 18px 0', width: '100%', boxSizing: 'border-box', color: 'var(--text)' },
  loading: { padding: 60, textAlign: 'center', color: 'var(--overlay0)' },
  title: { fontSize: 20, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 12, margin: '0 0 12px', lineHeight: 1.6 },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    margin: '0 0 16px',
  },
  summaryItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    background: 'var(--surface0)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 11.5,
    color: 'var(--subtext0)',
  },
  section: { padding: 14, marginBottom: 14 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  sectionHeadText: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  sectionDesc: { fontSize: 11.5, marginTop: 4, lineHeight: 1.6, minWidth: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { fontSize: 12, padding: '8px 0' },
  rowCard: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--bg-crust)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' },
  rowTop: { display: 'flex', gap: 8, alignItems: 'center' },
  rowHead: { display: 'flex', alignItems: 'center', gap: 6 },
  code: { fontSize: 12, color: 'var(--blue)', fontFamily: 'monospace' },
  flex1: { flex: 1, minWidth: 0 },
  delBtn: { flexShrink: 0 },
  testBtn: { flexShrink: 0, color: 'var(--blue)', borderColor: 'var(--blue)' },
  testStatus: { fontSize: 11.5, lineHeight: 1.6, wordBreak: 'break-word' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  fieldCol: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  fieldLabel: { fontSize: 11, color: 'var(--overlay0)' },
  footer: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '16px -18px 0',
    padding: '12px 18px 14px',
    background: 'var(--bg-base)',
    borderTop: '1px solid var(--border)',
  },
  saveBtn: { padding: '8px 28px' },
}
