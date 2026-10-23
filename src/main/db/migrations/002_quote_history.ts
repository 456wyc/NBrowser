// Migration 002: 行情历史落库
// 每次轮询取到的行情快照写入此表，供走势回放与复盘对照使用。
// ts 为采样时间戳（毫秒），symbol + ts 唯一，重复采样（同一毫秒）忽略。

export const migration_002 = `
-- 行情历史快照
CREATE TABLE IF NOT EXISTS quote_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  ts INTEGER NOT NULL,
  price REAL NOT NULL,
  change_percent REAL,
  change_amount REAL,
  open REAL,
  prev_close REAL,
  high REAL,
  low REAL,
  volume REAL,
  amount REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_history_symbol_ts ON quote_history(symbol, ts);
CREATE INDEX IF NOT EXISTS idx_quote_history_symbol ON quote_history(symbol);
`
