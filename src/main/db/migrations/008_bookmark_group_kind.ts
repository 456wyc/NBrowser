// Migration 008: 常用网站内置分类
// bookmark_groups 增加 kind：'builtin' 系统内置分类（首次启动播种）/ 'custom' 用户自建

export const migration_008 = `
ALTER TABLE bookmark_groups ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom';
`
