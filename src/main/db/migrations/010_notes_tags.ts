// Migration 010: 笔记标签
// 在 notes 表增加 tags_json 列（JSON 数组字符串）。
// sql.js 不支持 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，故先用 PRAGMA 检测列是否存在再补加，
// 保证重复执行（或未来 009 已含该列）时不会报 "duplicate column"。

import type { Database } from 'sql.js'

export function migration_010(db: Database): void {
  const res = db.exec('PRAGMA table_info(notes)')
  const cols = new Set(
    res.length > 0 ? (res[0].values as unknown[][]).map((r) => r[1] as string) : []
  )
  if (!cols.has('tags_json')) {
    db.run(`ALTER TABLE notes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`)
  }
}
