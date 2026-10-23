// Migration 003: 自选股分组（自定义分组 + 智能分组）
// - watchlist_groups: 分组定义（custom 自定义 / smart 智能）
// - watchlist.group_id: 股票所属自定义分组（0 = 未分组；智能分组为虚拟分组，不存成员关系）

export const migration_003 = `
CREATE TABLE IF NOT EXISTS watchlist_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  rule TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE watchlist ADD COLUMN group_id INTEGER NOT NULL DEFAULT 0;
`
