// Migration 007: 策略运行信号日志
// 记录策略运行期间触发的买卖点信号（标的 / 动作 / 价格 / 原因 / 时间），供面板回看。

export const migration_007 = `
CREATE TABLE IF NOT EXISTS strategy_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'buy' | 'sell'
  price REAL NOT NULL,
  reason TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strategy_signals_strategy_ts
  ON strategy_signals (strategy_id, ts DESC);
`
