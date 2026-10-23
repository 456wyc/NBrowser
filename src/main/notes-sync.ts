// 笔记 → .md 文件自动同步（单向：DB 是唯一事实源，文件是实时镜像）
//
// 设计：
// - DB 仍是唯一事实源；这里只做「把每条笔记实时镜像成 userData/notes-md/ 下的 .md」，
//   方便在文件管理器 / Obsidian 等外部工具里直接查看。
// - 文件不做反向解析回 DB（不做双向同步），外部编辑不会被采纳，避免冲突处理的复杂度。
// - 文件名 `{id}-{安全标题}.md`：id 前缀保证稳定映射与删除清理，不受标题改名影响。
// - 元数据（标签/置顶/时间）放 YAML frontmatter；AI 讨论记录不落文件（体积大且非正文）。
// - 写入走「临时文件 + rename」原子替换，避免写到一半崩溃留下残缺文件。

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface SyncNote {
  id: number
  title: string
  content: string
  tags?: string[]
  pin?: number
  created_at?: string | number
  updated_at?: string | number
}

/** 同步目录：userData/notes-md */
export function getNotesSyncDir(): string {
  const dir = path.join(app.getPath('userData'), 'notes-md')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 文件名安全化：去掉 Windows 非法字符与控制符，限制长度 */
function safeName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 50)
    .trim()
  return cleaned || 'untitled'
}

function fileNameOf(note: SyncNote): string {
  return `${note.id}-${safeName(note.title)}.md`
}

/** 生成带 YAML frontmatter 的 Markdown 正文 */
export function buildSyncMd(note: SyncNote): string {
  const fm = [
    '---',
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `tags: ${JSON.stringify(note.tags ?? [])}`,
    `pin: ${note.pin ? 'true' : 'false'}`,
    `created: ${JSON.stringify(note.created_at ?? '')}`,
    `updated: ${JSON.stringify(note.updated_at ?? '')}`,
    '---',
    '',
  ].join('\n')
  return `${fm}${note.content}\n`
}

/** 单条笔记同步到文件（原子替换） */
export function syncNoteToFile(note: SyncNote): void {
  const dir = getNotesSyncDir()
  const target = path.join(dir, fileNameOf(note))
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, buildSyncMd(note), 'utf8')
  try {
    fs.renameSync(tmp, target)
  } catch {
    // rename 失败（如目标被占用）退化为直接覆盖写
    fs.writeFileSync(target, buildSyncMd(note), 'utf8')
    fs.rmSync(tmp, { force: true })
  }
  // 标题改名后旧文件名会残留，按 id 前缀清掉除当前之外的同 id 文件
  const prefix = `${note.id}-`
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && f.endsWith('.md') && f !== path.basename(target)) {
      fs.rmSync(path.join(dir, f), { force: true })
    }
  }
}

/** 删除笔记时清理对应文件（按 id 前缀匹配，不依赖标题） */
export function removeNoteFile(id: number): void {
  const dir = getNotesSyncDir()
  const prefix = `${id}-`
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && (f.endsWith('.md') || f.endsWith('.md.tmp'))) {
      fs.rmSync(path.join(dir, f), { force: true })
    }
  }
}

/**
 * 启动时全量对齐一次：写入全部笔记 + 清理 DB 里已不存在的孤儿文件。
 * 单向镜像，所以以 DB 为准做增删。
 */
export function reconcileNotesSync(notes: SyncNote[]): void {
  const dir = getNotesSyncDir()
  const validIds = new Set(notes.map((n) => n.id))
  for (const f of fs.readdirSync(dir)) {
    const m = /^(\d+)-/.exec(f)
    if (m && !validIds.has(Number(m[1]))) {
      fs.rmSync(path.join(dir, f), { force: true })
    }
  }
  for (const n of notes) {
    try {
      syncNoteToFile(n)
    } catch (err) {
      console.error(`[notes-sync] 笔记 ${n.id} 同步失败：`, err)
    }
  }
}
