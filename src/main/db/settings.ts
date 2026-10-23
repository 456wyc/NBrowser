import type { Database } from 'sql.js'
import { DEFAULT_CALENDAR, type TradingCalendarConfig } from '../quote/trading-calendar'
import { DEFAULT_SEARCH_TEMPLATE } from '@shared/url'
import type { Space } from '@shared/ipc'

/**
 * 获取设置值
 */
export function getSetting(db: Database, key: string): string | null {
  const result = db.exec('SELECT value FROM settings WHERE key = ?', [key])
  if (result.length === 0 || result[0].values.length === 0) return null
  return result[0].values[0][0] as string
}

/**
 * 设置值（存在则更新，不存在则插入）
 */
export function setSetting(db: Database, key: string, value: string): void {
  const existing = getSetting(db, key)
  if (existing !== null) {
    db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
  } else {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
  }
}

/**
 * 获取是否启用轨迹记录
 */
export function isTrackingEnabled(db: Database): boolean {
  const val = getSetting(db, 'tracking_enabled')
  // 默认开启
  return val === null ? true : val === '1'
}

/**
 * 设置是否启用轨迹记录
 */
export function setTrackingEnabled(db: Database, enabled: boolean): void {
  setSetting(db, 'tracking_enabled', enabled ? '1' : '0')
}

/**
 * 获取默认搜索引擎的 URL 模板（%s 为搜索词占位符）
 * 未设置或模板非法时回退到内置默认（百度），保证永远可搜
 */
export function getSearchEngineTemplate(db: Database): string {
  const val = getSetting(db, 'search_engine_template')
  return val && val.includes('%s') ? val : DEFAULT_SEARCH_TEMPLATE
}

/**
 * 设置默认搜索引擎的 URL 模板
 */
export function setSearchEngineTemplate(db: Database, template: string): void {
  setSetting(db, 'search_engine_template', template)
}

// ---------- 空间配置（JSON 存 settings，首读为空时回退内置三空间） ----------

const BUILTIN_SPACES: Space[] = [
  { id: 'watch', name: '盯盘', icon: '📊' },
  { id: 'research', name: '研究', icon: '🔍' },
  { id: 'review', name: '复盘', icon: '📝' },
  { id: 'notes', name: '笔记', icon: '📒' },
]

export function getSpaces(db: Database): Space[] {
  const val = getSetting(db, 'spaces_config')
  if (!val) return BUILTIN_SPACES
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed) && parsed.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string')) {
      return parsed as Space[]
    }
  } catch {
    // 损坏则回退默认
  }
  return BUILTIN_SPACES
}

export function setSpaces(db: Database, spaces: Space[]): void {
  setSetting(db, 'spaces_config', JSON.stringify(spaces))
}

/**
 * 获取域名黑名单（逗号分隔的域名列表）
 */
export function getDomainBlacklist(db: Database): string[] {
  const val = getSetting(db, 'tracking_blacklist')
  if (!val) {
    // 默认黑名单：常见券商域名
    return [
      'trade.10jqka.com.cn',
      'trade.eastmoney.com',
      'client.safesvc.10jqka.com.cn',
    ]
  }
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * 设置域名黑名单
 */
export function setDomainBlacklist(db: Database, domains: string[]): void {
  setSetting(db, 'tracking_blacklist', domains.join(','))
}

/**
 * 检查 URL 是否在黑名单中
 */
export function isUrlBlacklisted(db: Database, url: string): boolean {
  const blacklist = getDomainBlacklist(db)
  if (blacklist.length === 0) return false

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    return blacklist.some((domain) => {
      const d = domain.toLowerCase()
      return hostname === d || hostname.endsWith('.' + d)
    })
  } catch {
    return false
  }
}

/**
 * 交易日历配置（节假日与调休）。未设置时回退到内置默认日历。
 */
export const TRADING_CALENDAR_KEY = 'trading_calendar'

export function getTradingCalendar(db: Database): TradingCalendarConfig {
  const raw = getSetting(db, TRADING_CALENDAR_KEY)
  if (!raw) return DEFAULT_CALENDAR
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.holidays) && Array.isArray(parsed.makeupWorkdays)) {
      return parsed as TradingCalendarConfig
    }
  } catch {
    /* 解析失败回退默认 */
  }
  return DEFAULT_CALENDAR
}

export function setTradingCalendar(db: Database, config: TradingCalendarConfig): void {
  setSetting(db, TRADING_CALENDAR_KEY, JSON.stringify(config))
}
