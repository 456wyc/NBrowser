import type { Database } from 'sql.js'

export interface Bookmark {
  id: number
  title: string
  url: string
  sort_order: number
  created_at: number
  group_id: number // 所属分组，0 = 未分组
}

const DEFAULT_BOOKMARKS = [
  { title: '东方财富', url: 'https://www.eastmoney.com/' },
  { title: '同花顺', url: 'https://www.10jqka.com.cn/' },
  { title: '雪球', url: 'https://xueqiu.com/' },
  { title: '巨潮资讯', url: 'http://www.cninfo.com.cn/' },
]

/** 内置分类（kind='builtin'），首次播种后与用户自建分组同等可编辑 */
const BUILTIN_GROUPS: { name: string; sites: { title: string; url: string }[] }[] = [
  {
    name: '行情看盘',
    sites: [
      { title: '东方财富', url: 'https://www.eastmoney.com/' },
      { title: '同花顺', url: 'https://www.10jqka.com.cn/' },
      { title: '雪球', url: 'https://xueqiu.com/' },
      { title: '腾讯自选股', url: 'https://gu.qq.com/' },
      { title: '新浪财经', url: 'https://finance.sina.com.cn/' },
      { title: '证券之星', url: 'https://www.stockstar.com/' },
    ],
  },
  {
    name: '财经资讯',
    sites: [
      { title: '财联社', url: 'https://www.cls.cn/' },
      { title: '华尔街见闻', url: 'https://wallstreetcn.com/' },
      { title: '证券时报', url: 'https://www.stcn.com/' },
      { title: '中国证券报', url: 'https://www.cs.com.cn/' },
      { title: '第一财经', url: 'https://www.yicai.com/' },
    ],
  },
  {
    name: '数据公告',
    sites: [
      { title: '巨潮资讯', url: 'http://www.cninfo.com.cn/' },
      { title: '上交所', url: 'https://www.sse.com.cn/' },
      { title: '深交所', url: 'https://www.szse.cn/' },
      { title: '中国结算', url: 'https://www.chinaclear.cn/' },
      { title: 'i问财选股', url: 'https://www.iwencai.com/' },
    ],
  },
  {
    name: '券商交易',
    sites: [
      { title: '中信证券', url: 'https://www.cs.ecitic.com/' },
      { title: '华泰证券', url: 'https://www.htsc.com.cn/' },
      { title: '国泰君安', url: 'https://www.gtja.com/' },
      { title: '平安证券', url: 'https://stock.pingan.com/' },
      { title: '招商证券', url: 'https://www.newone.com.cn/' },
    ],
  },
  {
    name: '基金理财',
    sites: [
      { title: '天天基金', url: 'https://fund.eastmoney.com/' },
      { title: '蛋卷基金', url: 'https://danjuanfunds.com/' },
      { title: '晨星网', url: 'https://www.morningstar.cn/' },
    ],
  },
  {
    name: '宏观数据',
    sites: [
      { title: '国家统计局', url: 'https://www.stats.gov.cn/' },
      { title: '中国人民银行', url: 'http://www.pbc.gov.cn/' },
      { title: '东方财富数据中心', url: 'https://data.eastmoney.com/' },
    ],
  },
]

/**
 * 播种内置分类与网站（幂等：已存在 builtin 分组则跳过）。
 * 按网址查重，老用户已有的同址书签不会重复插入。
 */
export function seedBuiltinBookmarkGroups(db: Database): void {
  const exist = db.exec(`SELECT COUNT(*) FROM bookmark_groups WHERE kind = 'builtin'`)
  const count = exist.length > 0 ? Number(exist[0].values[0][0]) : 0
  if (count > 0) return

  const now = Date.now()
  BUILTIN_GROUPS.forEach((g, gi) => {
    db.run(
      `INSERT INTO bookmark_groups (name, sort_order, created_at, kind) VALUES (?, ?, ?, 'builtin')`,
      [g.name, gi, now]
    )
    const groupId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
    g.sites.forEach((site, si) => {
      // 按网址查重：老用户的同名书签（在未分组）保持原样，不重复插入
      const dup = db.exec('SELECT COUNT(*) FROM bookmarks WHERE url = ?', [site.url])
      if (dup.length > 0 && Number(dup[0].values[0][0]) > 0) return
      db.run(
        `INSERT INTO bookmarks (title, url, sort_order, created_at, group_id) VALUES (?, ?, ?, ?, ?)`,
        [site.title, site.url, gi * 100 + si, now, groupId]
      )
    })
  })
}

/**
 * 首次启动时插入默认书签（老接口，仍被引用时兜底）
 */
export function insertDefaultBookmarks(db: Database): void {
  const now = Date.now()
  DEFAULT_BOOKMARKS.forEach((bm, index) => {
    db.run(
      `INSERT INTO bookmarks (title, url, sort_order, created_at) VALUES (?, ?, ?, ?)`,
      [bm.title, bm.url, index, now]
    )
  })
}

/**
 * 将 sql.js 查询结果转为对象数组
 */
function toObjects<T>(result: { columns: string[]; values: any[][] }): T[] {
  if (!result || !result.values) return []
  return result.values.map((row) => {
    const obj: Record<string, any> = {}
    result.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj as T
  })
}

/**
 * 获取所有书签（按 sort_order 升序）
 */
export function getAllBookmarks(db: Database): Bookmark[] {
  const result = db.exec('SELECT * FROM bookmarks ORDER BY sort_order ASC, id ASC')
  return result.length > 0 ? toObjects<Bookmark>(result[0]) : []
}

/**
 * 新增书签
 */
export function addBookmark(
  db: Database,
  params: { title: string; url: string; group_id?: number }
): Bookmark {
  const now = Date.now()
  const maxResult = db.exec('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM bookmarks')
  const maxOrder =
    maxResult.length > 0 && maxResult[0].values.length > 0
      ? Number(maxResult[0].values[0][0])
      : -1
  const sortOrder = maxOrder + 1

  db.run(
    `INSERT INTO bookmarks (title, url, sort_order, created_at, group_id) VALUES (?, ?, ?, ?, ?)`,
    [params.title, params.url, sortOrder, now, params.group_id ?? 0]
  )

  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  const result = db.exec('SELECT * FROM bookmarks WHERE id = ?', [id])
  return toObjects<Bookmark>(result[0])[0]
}

/**
 * 更新书签（标题/网址）
 */
export function updateBookmark(
  db: Database,
  params: { id: number; title: string; url: string; group_id?: number }
): Bookmark | null {
  db.run('UPDATE bookmarks SET title = ?, url = ?, group_id = ? WHERE id = ?', [
    params.title,
    params.url,
    params.group_id ?? 0,
    params.id,
  ])
  const result = db.exec('SELECT * FROM bookmarks WHERE id = ?', [params.id])
  const rows = result.length > 0 ? toObjects<Bookmark>(result[0]) : []
  return rows[0] || null
}

/**
 * 删除书签
 */
export function deleteBookmark(db: Database, id: number): boolean {
  const before = countBookmarks(db)
  db.run('DELETE FROM bookmarks WHERE id = ?', [id])
  const after = countBookmarks(db)
  return before > after
}

function countBookmarks(db: Database): number {
  const result = db.exec('SELECT COUNT(*) as cnt FROM bookmarks')
  return result.length > 0 && result[0].values.length > 0
    ? Number(result[0].values[0][0])
    : 0
}

/**
 * 更新书签排序
 */
export function reorderBookmarks(db: Database, ids: number[]): void {
  ids.forEach((id, index) => {
    db.run('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [index, id])
  })
}

// ---------- 分组 ----------

export interface BookmarkGroup {
  id: number
  name: string
  sort_order: number
  created_at: number
  /** 'builtin' 系统内置分类 / 'custom' 用户自建（migration 008 后存在） */
  kind?: 'builtin' | 'custom'
}

/** 获取所有分组（按 sort_order 升序） */
export function getBookmarkGroups(db: Database): BookmarkGroup[] {
  const result = db.exec('SELECT * FROM bookmark_groups ORDER BY sort_order ASC, id ASC')
  return result.length > 0 ? toObjects<BookmarkGroup>(result[0]) : []
}

/** 新建分组 */
export function createBookmarkGroup(db: Database, name: string): BookmarkGroup {
  const now = Date.now()
  const maxResult = db.exec('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM bookmark_groups')
  const maxOrder =
    maxResult.length > 0 && maxResult[0].values.length > 0
      ? Number(maxResult[0].values[0][0])
      : -1
  db.run(
    'INSERT INTO bookmark_groups (name, sort_order, created_at) VALUES (?, ?, ?)',
    [name, maxOrder + 1, now]
  )
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
  const result = db.exec('SELECT * FROM bookmark_groups WHERE id = ?', [id])
  return toObjects<BookmarkGroup>(result[0])[0]
}

/** 重命名分组 */
export function updateBookmarkGroup(
  db: Database,
  params: { id: number; name: string }
): BookmarkGroup | null {
  db.run('UPDATE bookmark_groups SET name = ? WHERE id = ?', [params.name, params.id])
  const result = db.exec('SELECT * FROM bookmark_groups WHERE id = ?', [params.id])
  const rows = result.length > 0 ? toObjects<BookmarkGroup>(result[0]) : []
  return rows[0] || null
}

/**
 * 删除分组：其下书签退回未分组（group_id = 0），不删书签本身
 */
export function deleteBookmarkGroup(db: Database, id: number): void {
  db.run('UPDATE bookmarks SET group_id = 0 WHERE group_id = ?', [id])
  db.run('DELETE FROM bookmark_groups WHERE id = ?', [id])
}

/** 设置书签所属分组 */
export function setBookmarkGroup(db: Database, id: number, groupId: number): void {
  db.run('UPDATE bookmarks SET group_id = ? WHERE id = ?', [groupId, id])
}
