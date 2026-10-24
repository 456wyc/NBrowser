import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useToast } from '../hooks/useToast'

/**
 * 桌宠（牛来）设置：名字 + 系统提示词（人设）
 *
 * 名字会显示在桌宠聊天面板标题，并作为身份注入到每一轮对话；
 * 系统提示词用来定义性格与说话风格，留空则只注入名字、保留模型通用能力设定。
 */
export function PetSettingsPage() {
  const [name, setName] = useState('牛来')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.PET_GET_CONFIG, {})
        setName(res.config.name)
        setSystemPrompt(res.config.systemPrompt)
      } catch (err) {
        console.error('Failed to load pet config:', err)
        showToast('读取桌宠配置失败，显示的可能不是当前值', false)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PET_SET_CONFIG, {
        name: name.trim(),
        systemPrompt,
      })
      setName(res.config.name)
      setSystemPrompt(res.config.systemPrompt)
      showToast('已保存，桌宠下一条消息生效')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.PET_SET_CONFIG, {
        name: name.trim() || '牛来',
        restoreDefault: true,
      })
      setSystemPrompt(res.config.systemPrompt)
      showToast('已恢复默认人设')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '恢复失败', false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={styles.loading}>加载中…</div>

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>桌宠（牛来）</h2>
      <p style={styles.desc}>
        配置桌面小跟班的名字与人设。保存在本地{' '}
        <code style={styles.code}>userData/config.json</code>，不会上传。
      </p>

      <div style={styles.field}>
        <label style={styles.label}>名字</label>
        <input
          className="field"
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
          placeholder="牛来"
        />
        <div style={styles.fieldHint}>
          显示在桌宠聊天面板标题上，并会作为身份注入对话——改完之后问它「你是谁」，它会用新名字回答。
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>系统提示词（人设）</label>
        <textarea
          className="textarea"
          value={systemPrompt}
          rows={8}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={
            '例如：你是牛来，一个毒舌但靠谱的盯盘搭子。回答永远不超过三句话，先给结论。'
          }
          style={{ resize: 'vertical' }}
        />
        <div style={styles.fieldHint}>
          定义性格、说话风格、回答长度等。留空则只注入名字，保留助手原有的行情查询、
          自选股、笔记等工具能力。
        </div>
      </div>

      <div style={styles.actions}>
        <button className="btn" onClick={() => void handleReset()} disabled={saving}>
          恢复默认人设
        </button>
        <button
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={styles.toastInline}>
          {toast.text}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 16, display: 'flex', flexDirection: 'column', gap: 18 },
  loading: { padding: 16, fontSize: 13, color: 'var(--overlay0)' },
  title: { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' },
  desc: { margin: 0, fontSize: 12.5, lineHeight: 1.7, color: 'var(--subtext0)' },
  code: {
    background: 'var(--surface0)',
    padding: '1px 5px',
    borderRadius: 4,
    color: 'var(--blue)',
    fontSize: 12,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  fieldHint: { fontSize: 11.5, color: 'var(--overlay0)', lineHeight: 1.6 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  toastInline: { marginTop: 4 },
}
