import type { Database } from 'sql.js'

/** 一条对话消息（用户 / AI） */
export interface NoteMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 笔记列表项（不含正文，列表用） */
export interface NoteSummary {
  id: number
  title: string
  pin: number
  updated_at: number
  preview: string
  tags: string[]
}

/** 完整笔记（含正文与对话） */
export interface Note {
  id: number
  title: string
  content: string
  pin: number
  created_at: number
  updated_at: number
  chat: NoteMessage[]
  tags: string[]
}

/** 保存请求（id 缺省表示新建） */
export interface SaveNoteInput {
  id?: number
  title?: string
  content?: string
  chat?: NoteMessage[]
  pin?: number
  tags?: string[]
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
  } catch {
    return []
  }
}

export function createNotesTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      chat_json TEXT NOT NULL DEFAULT '[]',
      pin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  // 旧库兼容：为新版标签列做迁移（sql.js 不支持 ADD COLUMN IF NOT EXISTS）
  const cols = new Set(
    (db.exec('PRAGMA table_info(notes)')[0]?.values ?? []).map((r) => r[1] as string)
  )
  if (!cols.has('tags_json')) {
    db.run(`ALTER TABLE notes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`)
  }
}

function parseChat(raw: string | null): NoteMessage[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))
  } catch {
    return []
  }
}

export function listNotes(db: Database): NoteSummary[] {
  const res = db.exec(`
    SELECT id, title, content, pin, updated_at, tags_json
    FROM notes
    ORDER BY pin DESC, updated_at DESC
  `)
  if (!res.length) return []
  return (res[0].values as unknown[][]).map((row) => {
    const [id, title, content, pin, updated_at, tags_json] = row as [
      number,
      string,
      string,
      number,
      number,
      string,
    ]
    const text = String(content || '')
    const preview = text.replace(/\s+/g, ' ').slice(0, 80)
    return { id, title: String(title || ''), pin: pin ? 1 : 0, updated_at, preview, tags: parseTags(tags_json) }
  })
}

export function getNote(db: Database, id: number): Note | null {
  const res = db.exec(
    `SELECT id, title, content, chat_json, pin, created_at, updated_at, tags_json FROM notes WHERE id = ${id}`
  )
  if (!res.length) return null
  const row = res[0].values[0] as unknown[]
  const [nid, title, content, chat_json, pin, created_at, updated_at, tags_json] = row as [
    number,
    string,
    string,
    string,
    number,
    number,
    number,
    string,
  ]
  return {
    id: nid,
    title: String(title || ''),
    content: String(content || ''),
    pin: pin ? 1 : 0,
    created_at,
    updated_at,
    chat: parseChat(chat_json),
    tags: parseTags(tags_json),
  }
}

export function saveNote(db: Database, input: SaveNoteInput): Note {
  const now = Date.now()
  const tags = input.tags !== undefined ? input.tags.map((t) => t.trim()).filter(Boolean) : undefined
  if (typeof input.id === 'number') {
    const existing = getNote(db, input.id)
    if (!existing) throw new Error(`笔记不存在：id=${input.id}`)
    const title = input.title !== undefined ? input.title : existing.title
    const content = input.content !== undefined ? input.content : existing.content
    const pin = input.pin !== undefined ? (input.pin ? 1 : 0) : existing.pin
    const chat = input.chat !== undefined ? input.chat : existing.chat
    const tagsToSave = tags !== undefined ? tags : existing.tags
    db.run(
      `UPDATE notes SET title = ?, content = ?, chat_json = ?, pin = ?, tags_json = ?, updated_at = ? WHERE id = ?`,
      [title, content, JSON.stringify(chat), pin, JSON.stringify(tagsToSave), now, input.id]
    )
    return getNote(db, input.id)!
  }
  const title = input.title ?? ''
  const content = input.content ?? ''
  const pin = input.pin ? 1 : 0
  const chat = input.chat ?? []
  db.run(
    `INSERT INTO notes (title, content, chat_json, pin, created_at, updated_at, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, content, JSON.stringify(chat), pin, now, now, JSON.stringify(tags ?? [])]
  )
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  return getNote(db, id)!
}

export function deleteNote(db: Database, id: number): boolean {
  db.run(`DELETE FROM notes WHERE id = ${id}`)
  return true
}

/** 知识库问答用：取全部非空正文笔记 */
export function getAllNotesForKb(db: Database): Array<{ id: number; title: string; content: string }> {
  const res = db.exec(`SELECT id, title, content FROM notes`)
  if (!res.length) return []
  return (res[0].values as unknown[][]).map((row) => {
    const [id, title, content] = row as [number, string, string]
    return { id, title: String(title || ''), content: String(content || '') }
  })
}

function toSummary(row: unknown[]): NoteSummary {
  const [id, title, content, pin, updated_at, tags_json] = row as [
    number,
    string,
    string,
    number,
    number,
    string,
  ]
  const text = String(content || '')
  const preview = text.replace(/\s+/g, ' ').slice(0, 80)
  return { id, title: String(title || ''), pin: pin ? 1 : 0, updated_at, preview, tags: parseTags(tags_json) }
}

/** 按标题 / 正文全文搜索（不区分大小写） */
export function searchNotes(db: Database, query: string): NoteSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return listNotes(db)
  const res = db.exec(`SELECT id, title, content, pin, updated_at, tags_json FROM notes`)
  if (!res.length) return []
  return (res[0].values as unknown[][])
    .map((row) => {
      const text = String((row[2] as string) || '')
      return {
        summary: toSummary(row),
        hay: `${row[1]}\n${text}`.toLowerCase(),
      }
    })
    .filter((x) => x.hay.includes(q))
    .map((x) => x.summary)
    .sort((a, b) => (b.pin - a.pin) || (b.updated_at - a.updated_at))
}

/** 导出用：取全部笔记（含正文、对话、时间、标签），按置顶 + 更新时间排序 */
export function getAllNotesFull(db: Database): Note[] {
  const res = db.exec(
    `SELECT id, title, content, chat_json, pin, created_at, updated_at, tags_json FROM notes ORDER BY pin DESC, updated_at DESC`
  )
  if (!res.length) return []
  return (res[0].values as unknown[][]).map((row) => {
    const [id, title, content, chat_json, pin, created_at, updated_at, tags_json] = row as [
      number,
      string,
      string,
      string,
      number,
      number,
      number,
      string,
    ]
    return {
      id,
      title: String(title || ''),
      content: String(content || ''),
      pin: pin ? 1 : 0,
      created_at,
      updated_at,
      chat: parseChat(chat_json),
      tags: parseTags(tags_json),
    }
  })
}
