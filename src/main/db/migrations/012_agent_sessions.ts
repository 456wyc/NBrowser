// Migration 012: AI 助手（Copilot）会话
// agent_sessions 表存储 Copilot 的多轮对话会话：
// - messages_json 为 OpenAI 兼容格式的消息数组（JSON 字符串），含 user/assistant/tool 消息
// - title 取首条用户消息的摘要，便于会话列表识别
// - 时间统一为 UTC 毫秒时间戳

export const migration_012 = `
CREATE TABLE IF NOT EXISTS agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at DESC);
`
