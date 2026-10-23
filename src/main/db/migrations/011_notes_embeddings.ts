// Migration 011: 笔记向量检索
// 在 notes 表增加 embedding_json 列，存储本地模型生成的 384 维句向量（JSON 数组字符串）。
// 同样用 PRAGMA 检测做幂等，避免 sql.js 不支持 ADD COLUMN IF NOT EXISTS。

import type { Database } from 'sql.js'

export function migration_011(db: Database): void {
  const res = db.exec('PRAGMA table_info(notes)')
  const cols = new Set(
    res.length > 0 ? (res[0].values as unknown[][]).map((r) => r[1] as string) : []
  )
  if (!cols.has('embedding_json')) {
    db.run(`ALTER TABLE notes ADD COLUMN embedding_json TEXT`)
  }
}
