import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useToast } from '../hooks/useToast'

const PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '阿里通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
]

export function AiSettingsPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_GET_CONFIG, {})
        setBaseUrl(res.baseUrl)
        setModel(res.model)
        setHasApiKey(res.hasApiKey)
      } catch (err) {
        console.error('Failed to load AI config:', err)
        showToast('读取 AI 配置失败，显示的可能不是当前值', false)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_SET_CONFIG, {
        baseUrl,
        // 留空表示不修改已保存的 Key
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model,
      })
      setApiKey('')
      setHasApiKey(true)
      showToast('已保存，立即生效')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={styles.loading}>加载中…</div>

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>AI 设置</h2>
      <p style={styles.desc}>
        用于「页面整理」功能。需要任何兼容 OpenAI Chat Completions 协议的服务即可。
        配置保存在本地 <code style={styles.code}>userData/config.json</code>，不会上传。
      </p>

      {/* 预设 */}
      <div style={styles.field}>
        <label style={styles.label}>快速填充</label>
        <div style={styles.presetRow}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setBaseUrl(p.baseUrl)
                setModel(p.model)
              }}
              className="chip"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>API Base URL</label>
        <input
          className="field"
          style={styles.fieldWide}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>模型名称</label>
        <input
          className="field"
          style={styles.fieldWide}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>
          API Key
          {hasApiKey && <span style={styles.keyStatus}>· 已保存（不显示明文）</span>}
        </label>
        <input
          type="password"
          className="field"
          style={styles.fieldWide}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? '留空则保持原 Key 不变' : 'sk-...'}
        />
      </div>

      <div style={styles.actions}>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? '保存中…' : '保存'}
        </button>
        {toast && <span className={toast.ok ? 'toast' : 'toast-error'}>{toast.text}</span>}
      </div>

      <div style={styles.note}>
        <div style={styles.noteTitle}>合规约束（已写入系统提示词）</div>
        <ul style={styles.noteUl}>
          <li>禁止预测股价、禁止给出买入/卖出/持有建议、禁止目标价</li>
          <li>所有结论必须来自原文，原文没有的一律进入「存疑」</li>
          <li>社区讨论类内容强制标记为「观点」，并在界面显著提示</li>
        </ul>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '16px 18px', width: '100%', boxSizing: 'border-box', color: 'var(--text)' },
  loading: { padding: 60, textAlign: 'center', color: 'var(--overlay0)' },
  title: { fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' },
  desc: { fontSize: 13, color: 'var(--overlay0)', lineHeight: 1.7, marginBottom: 24 },
  code: {
    background: 'var(--surface0)',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--blue)',
  },
  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 13, color: 'var(--subtext0)', marginBottom: 6 },
  keyStatus: { marginLeft: 6, fontSize: 11, color: 'var(--green)' },
  fieldWide: { width: '100%' },
  presetRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 },
  note: {
    marginTop: 32,
    padding: 14,
    background: 'var(--bg-crust)',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  noteTitle: { fontSize: 12, fontWeight: 600, color: 'var(--subtext0)', marginBottom: 8 },
  noteUl: { margin: 0, paddingLeft: 18 },
}
