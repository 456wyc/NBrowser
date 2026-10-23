import { app, shell } from 'electron'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  statSync,
} from 'fs'

/**
 * 主进程日志落盘
 *
 * 自用场景下没有 devtools 可看，一旦出问题（数据库损坏、行情接口失败、
 * 导航首页路径解析失败等）只能靠猜。这里把 console 输出同步落一份到
 * userData/logs/app-YYYYMMDD.log，并自动清理超过保留天数的旧文件。
 *
 * 设计约束：
 * - 日志写入失败绝不能影响主流程（全部 try/catch 吞掉）
 * - 写入器内部不能再走 console，否则与补丁后的 console 互相递归
 * - 不接管 uncaughtException / unhandledRejection：
 *   注册监听会改变 Node 默认的崩溃行为（进程不再退出），反而更难排查
 */

const RETAIN_DAYS = 7

let logDir = ''
let inited = false

/** 当天的日志文件路径 */
function todayLogFile(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return join(logDir, `app-${yyyy}${mm}${dd}.log`)
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function writeLine(level: string, args: unknown[]): void {
  if (!logDir) return
  try {
    const ts = new Date().toISOString()
    const msg = args.map(formatArg).join(' ')
    appendFileSync(todayLogFile(), `[${ts}] [${level}] ${msg}\n`, 'utf8')
  } catch {
    // 日志写失败不能影响主流程
  }
}

/** 清理超过保留天数的旧日志 */
function pruneOldLogs(): void {
  try {
    const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000
    for (const name of readdirSync(logDir)) {
      if (!name.startsWith('app-') || !name.endsWith('.log')) continue
      const full = join(logDir, name)
      try {
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full)
      } catch {
        // 单个文件清理失败不影响其它文件
      }
    }
  } catch {
    // 清理失败可忽略
  }
}

/** 给 console 打补丁：照常输出到终端，同时追加到日志文件 */
function patchConsole(): void {
  const levels: Array<{ key: 'log' | 'info' | 'warn' | 'error' | 'debug'; level: string }> = [
    { key: 'log', level: 'INFO' },
    { key: 'info', level: 'INFO' },
    { key: 'debug', level: 'DEBUG' },
    { key: 'warn', level: 'WARN' },
    { key: 'error', level: 'ERROR' },
  ]

  for (const { key, level } of levels) {
    const original = console[key].bind(console)
    console[key] = (...args: unknown[]) => {
      // 先落盘再输出：即便随后崩溃，这条日志也已留下
      writeLine(level, args)
      original(...args)
    }
  }
}

/**
 * 初始化日志（幂等）。需在 app ready 之后调用（依赖 app.getPath）。
 * @returns 日志目录，失败返回空字符串
 */
export function initLogger(): string {
  if (inited) return logDir
  inited = true
  try {
    logDir = join(app.getPath('userData'), 'logs')
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    pruneOldLogs()
    patchConsole()
    console.log(`[main] Logger initialized, log dir: ${logDir}`)
  } catch (err) {
    // 日志初始化失败不应阻塞启动
    logDir = ''
    console.error('[main] Logger init failed:', err)
  }
  return logDir
}

/** 获取日志目录（未初始化时为空字符串） */
export function getLogDir(): string {
  return logDir
}

/** 当前日志文件名（未初始化时为空字符串） */
export function getTodayLogFile(): string {
  return logDir ? todayLogFile() : ''
}

/**
 * 读取当天日志的末尾若干行（供底部面板「日志」页展示）
 *
 * 只取尾部：日志文件会一直增长，全量读到渲染进程没有意义。
 * 读取失败返回空内容，不抛错——日志面板不是关键路径。
 */
export function tailLogLines(lines = 200): string {
  const file = getTodayLogFile()
  if (!file || !existsSync(file)) return ''
  try {
    const text = readFileSync(file, 'utf8')
    const all = text.split('\n')
    // 文件通常以换行结尾，末尾会多出一个空串，过滤掉
    return all.filter((l, i) => i < all.length - 1 || l !== '').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

/** 在系统文件管理器中打开日志目录（供菜单调用） */
export function openLogDir(): void {
  if (!logDir) return
  shell.openPath(logDir).catch(() => {
    // 打开失败忽略
  })
}
