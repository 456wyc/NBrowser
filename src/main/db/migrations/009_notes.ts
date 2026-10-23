// Migration 009: 笔记功能
// notes 表存储用户笔记（标题/正文/Markdown/置顶），chat_json 存储该笔记与 AI 的对话历史

export const migration_009 = `
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  chat_json TEXT NOT NULL DEFAULT '[]',
  pin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`
