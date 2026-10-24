import type { Database } from 'sql.js'

/** 一条 Copilot 会话记录 */
export interface AgentSession {
  id: number
  title: string
  /** OpenAI 兼容格式的消息数组 JSON（{role, content, tool_calls?, tool_call_id?}） */
  messages_json: string
  created_at: number
  updated_at: number
}

/** 列表项：不含消息体，避免一次拉回大量文本 */
export interface AgentSessionSummary {
  id: number
  title: string
  created_at: number
  updated_at: number
  messageCount: number
  preview: string
}

/** 序列化后的会话消息（与 OpenAI Chat Completions 消息格式对齐的子集） */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; name: string; arguments: string }[]
  tool_call_id?: string
  name?: string
}

function toObjects<T>(result: { columns: string[]; values: any[][] }): T[] {
  if (!result || !result.values) return []
  return result.values.map((row) => {
    const obj: Record<string, any> = {}
    result.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj as T
  })
}

/**
 * 解析会话消息 JSON。
 * 损坏或结构不符时返回空数组而不是抛出——坏数据不应让整个会话打不开。
 */
export function parseSessionMessages(json: string): AgentMessage[] {
  try {
    const parsed = JSON.parse(json || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is AgentMessage =>
        !!m && typeof m === 'object' && typeof m.role === 'string' && typeof m.content === 'string'
    )
  } catch {
    return []
  }
}

/** 新建会话，返回会话 ID */
export function createSession(db: Database, title = ''): number {
  const now = Date.now()
  db.run(
    `INSERT INTO agent_sessions (title, messages_json, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [title, '[]', now, now]
  )
  return db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
}

/** 更新会话标题与消息体 */
export function updateSession(
  db: Database,
  id: number,
  patch: { title?: string; messages_json?: string }
): void {
  const sets: string[] = ['updated_at = ?']
  const params: any[] = [Date.now()]
  if (patch.title !== undefined) {
    sets.push('title = ?')
    params.push(patch.title)
  }
  if (patch.messages_json !== undefined) {
    sets.push('messages_json = ?')
    params.push(patch.messages_json)
  }
  params.push(id)
  db.run(`UPDATE agent_sessions SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** 会话列表（按更新时间倒序，不含消息体） */
export function listSessions(db: Database, limit = 50): AgentSessionSummary[] {
  const result = db.exec(
    'SELECT * FROM agent_sessions ORDER BY updated_at DESC, id DESC LIMIT ?',
    [limit]
  )
  if (result.length === 0) return []
  return toObjects<AgentSession>(result[0]).map((s) => {
    const msgs = parseSessionMessages(s.messages_json)
    const firstUser = msgs.find((m) => m.role === 'user')
    return {
      id: s.id,
      title: s.title || firstUser?.content.slice(0, 20) || '新会话',
      created_at: s.created_at,
      updated_at: s.updated_at,
      messageCount: msgs.length,
      preview: firstUser ? firstUser.content.slice(0, 60) : '',
    }
  })
}

/** 读取单条会话（含消息体） */
export function getSession(db: Database, id: number): AgentSession | null {
  const result = db.exec('SELECT * FROM agent_sessions WHERE id = ?', [id])
  if (result.length === 0 || result[0].values.length === 0) return null
  return toObjects<AgentSession>(result[0])[0]
}

/** 删除会话 */
export function deleteSession(db: Database, id: number): boolean {
  const before = db.exec('SELECT COUNT(*) as cnt FROM agent_sessions')[0].values[0][0] as number
  db.run('DELETE FROM agent_sessions WHERE id = ?', [id])
  const after = db.exec('SELECT COUNT(*) as cnt FROM agent_sessions')[0].values[0][0] as number
  return after < before
}
