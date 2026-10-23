// Migration 006: AI 量化策略（结构化规则配置 + 落库管理）
// config 为 JSON，保存大模型从自然语言生成的可回测规则配置。

export const migration_006 = `
CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`
