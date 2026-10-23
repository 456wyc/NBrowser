// Migration 001: Initial schema
// 所有核心表定义见 PRD 第 10 节
// 时间统一用 UTC 毫秒时间戳（integer）

export const migration_001 = `
-- 自选股
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 导航首页书签
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 浏览轨迹
CREATE TABLE IF NOT EXISTS page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  symbol TEXT,
  space TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_page_visits_space ON page_visits(space);
CREATE INDEX IF NOT EXISTS idx_page_visits_symbol ON page_visits(symbol);
CREATE INDEX IF NOT EXISTS idx_page_visits_started_at ON page_visits(started_at);

-- AI 分析记录
CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  symbol TEXT,
  page_type TEXT NOT NULL DEFAULT 'unknown',
  input_excerpt TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_symbol ON ai_analyses(symbol);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at);

-- 交易记录
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  traded_at INTEGER NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 1,
  buy_reason TEXT,
  sell_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_unique ON trades(symbol, side, price, quantity, traded_at);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_traded_at ON trades(traded_at);

-- 复盘笔记
CREATE TABLE IF NOT EXISTS review_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL UNIQUE,
  was_reason_valid INTEGER,
  did_well TEXT,
  did_wrong TEXT,
  next_time TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

-- 设置（键值）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
