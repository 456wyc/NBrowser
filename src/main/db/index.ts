import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs'
import { seedBuiltinBookmarkGroups } from './bookmarks'
import { migration_001 } from './migrations/001_init'
import { migration_002 } from './migrations/002_quote_history'
import { migration_003 } from './migrations/003_watchlist_groups'
import { migration_004 } from './migrations/004_research_reports'
import { migration_005 } from './migrations/005_bookmark_groups'
import { migration_006 } from './migrations/006_strategies'
import { migration_007 } from './migrations/007_strategy_signals'
import { migration_008 } from './migrations/008_bookmark_group_kind'
import { migration_009 } from './migrations/009_notes'
import { migration_010 } from './migrations/010_notes_tags'
import { migration_011 } from './migrations/011_notes_embeddings'
import { pruneQuoteHistory } from './quote-history'
import { seedSmartGroups } from './watchlist'

let db: Database | null = null
let initPromise: Promise<void> | null = null
let SQL: SqlJsStatic | null = null

// 迁移列表，按序号排列；元素可为 SQL 字符串，或带 (db) => void 的函数（用于条件/幂等迁移）
type Migration = string | ((db: Database) => void)
const migrations: Migration[] = [
  migration_001,
  migration_002,
  migration_003,
  migration_004,
  migration_005,
  migration_006,
  migration_007,
  migration_008,
  migration_009,
  migration_010,
  migration_011,
]

/**
 * 获取数据库连接（异步初始化，单例）
 * 使用 sql.js (SQLite WASM)，无需原生模块，无 ABI 兼容问题
 * 数据库文件存放在用户数据目录下
 */
export async function getDb(): Promise<Database> {
  if (db) return db
  if (initPromise) {
    await initPromise
    if (db) return db
  }
  initPromise = initDatabase()
  await initPromise
  if (!db) throw new Error('Database initialization failed')
  return db
}

/**
 * 定位 sql.js 的 wasm/glue 资源
 * 优先用 require.resolve 从 node_modules 找，失败时按包根目录兜底，
 * 两种情况都拿不到就抛出带上下文的错误（而不是让 sql.js 内部静默卡死）。
 */
function resolveSqlJsAsset(file: string): string {
  const candidates: string[] = []

  try {
    return require.resolve(`sql.js/dist/${file}`)
  } catch {
    /* 继续兜底 */
  }

  try {
    const pkgDir = dirname(require.resolve('sql.js/package.json'))
    candidates.push(join(pkgDir, 'dist', file))
  } catch {
    /* 忽略 */
  }

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  throw new Error(
    `找不到 sql.js 资源文件 "${file}"。请确认已安装依赖中的 node_modules/sql.js/dist/，或重新安装依赖。`
  )
}

async function initDatabase(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'stock-browser.db')

  // 加载 sql.js WASM
  SQL = await initSqlJs({
    locateFile: (file: string) => resolveSqlJsAsset(file),
  })

  // 如果数据库文件已存在，加载它
  if (existsSync(dbPath)) {
    try {
      const fileBuffer = readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
    } catch (err) {
      // 库文件损坏时不能让应用卡在启动：备份损坏文件，用新库继续
      // （原子落盘已大幅降低该情况，这里作为最后兜底）
      console.error('[db] Existing database is corrupted, starting with a fresh one:', err)
      const backupPath = `${dbPath}.corrupt-${Date.now()}`
      try {
        renameSync(dbPath, backupPath)
        console.error(`[db] Corrupted database backed up to: ${backupPath}`)
      } catch (renameErr) {
        console.error('[db] Failed to back up corrupted database:', renameErr)
      }
      db = new SQL.Database()
    }
  } else {
    // 新建数据库
    db = new SQL.Database()
  }

  // 启用外键约束：SQLite 默认关闭，不开启的话
  // 删除交易时其复盘笔记不会被级联删除，会留下孤儿数据
  db.run('PRAGMA foreign_keys = ON')

  // 运行迁移
  runMigrations(db)

  // 种子数据
  seedInitialData(db)

  // 初始保存一次
  saveDatabase(db, dbPath)

  // 定期持久化（每 5 秒）
  setInterval(() => {
    if (db) {
      saveDatabase(db, dbPath)
    }
  }, 5000)

  // 行情历史自动清理：仅保留最近 30 天，避免每 5 秒一条无限膨胀
  setInterval(() => {
    if (db) {
      try {
        const removed = pruneQuoteHistory(db, Date.now() - 30 * 24 * 3600 * 1000)
        if (removed > 0) console.log(`[db] Pruned ${removed} old quote history records`)
      } catch (err) {
        console.error('[db] Failed to prune quote history:', err)
      }
    }
  }, 60 * 60 * 1000)

  // 应用退出时保存
  app.on('before-quit', () => {
    if (db) {
      saveDatabase(db, dbPath)
    }
  })
}

/**
 * 运行所有迁移脚本
 * 通过 user_version pragma 追踪已应用的迁移
 */
function runMigrations(db: Database): void {
  const versionResult = db.exec('PRAGMA user_version')
  const currentVersion =
    versionResult.length > 0 && versionResult[0].values.length > 0
      ? Number(versionResult[0].values[0][0])
      : 0

  for (let i = currentVersion; i < migrations.length; i++) {
    const migrationNum = i + 1
    console.log(`[db] Running migration ${migrationNum}`)
    const m = migrations[i]
    if (typeof m === 'string') {
      db.run(m)
    } else {
      m(db)
    }
    db.run(`PRAGMA user_version = ${migrationNum}`)
  }
}

/**
 * 种子数据：首次启动时插入默认书签与智能分组
 */
function seedInitialData(db: Database): void {
  // 内置分类与网站：按「无 builtin 分组」幂等播种（老用户也能获得新内置内容，且按网址查重不重复）
  seedBuiltinBookmarkGroups(db)
  // 智能分组为系统虚拟分组，仅首次（无 smart 分组时）写入
  seedSmartGroups(db)
}

/**
 * 将数据库保存到磁盘
 * sql.js 是内存数据库，需要手动持久化
 *
 * 采用「写临时文件 + 原子替换」：先落 .tmp 再 rename 覆盖。
 * 直接 writeFileSync 覆盖原文件时，若写入过程中进程退出，
 * 会留下截断的库文件导致整个数据库无法打开；原子替换可避免该问题。
 */
function saveDatabase(db: Database, dbPath: string): void {
  const tmpPath = `${dbPath}.tmp`
  try {
    const buffer = Buffer.from(db.export())
    writeFileSync(tmpPath, buffer)
    renameSync(tmpPath, dbPath)
  } catch (err) {
    console.error('[db] Failed to save database:', err)
    // 原子替换失败（如跨设备）时退化为直接写入，并清理临时文件
    try {
      writeFileSync(dbPath, Buffer.from(db.export()))
    } catch (fallbackErr) {
      console.error('[db] Fallback save also failed:', fallbackErr)
    }
  } finally {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* 忽略清理失败 */
    }
  }
}
