// Migration 005: 常用网站（书签）分组
// - bookmark_groups: 分组定义（纯自定义，无智能分组）
// - bookmarks.group_id: 书签所属分组（0 = 未分组）

export const migration_005 = `
CREATE TABLE IF NOT EXISTS bookmark_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE bookmarks ADD COLUMN group_id INTEGER NOT NULL DEFAULT 0;
`
