import type { Quote, QuoteProvider } from './provider'
import type { Database } from 'sql.js'
import { getAllSymbols } from '../db/watchlist'
import { getDb } from '../db'
import { addQuoteHistoryBatch } from '../db/quote-history'
import { getTradingCalendar } from '../db/settings'
import {
  isTradingHours as isTradingHoursFn,
  DEFAULT_CALENDAR,
  type TradingCalendarConfig,
} from './trading-calendar'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'

/**
 * 行情轮询配置
 */
export interface QuotePollingConfig {
  tradingIntervalMs: number // 交易时段轮询间隔（默认 5 秒）
  nonTradingIntervalMs: number // 非交易时段轮询间隔（默认 60 秒）
  stopWhenEmpty: boolean // 自选股为空时是否停止轮询
}

const DEFAULT_CONFIG: QuotePollingConfig = {
  tradingIntervalMs: 5000,
  nonTradingIntervalMs: 60000,
  stopWhenEmpty: true,
}

/**
 * 行情轮询管理器
 * - 管理轮询间隔（交易时段 / 非交易时段）
 * - 缓存最新行情数据
 * - 通过 IPC 推送给渲染进程
 */
export class QuotePollingManager {
  private provider: QuoteProvider
  private config: QuotePollingConfig
  private timer: NodeJS.Timeout | null = null
  private lastQuotes: Map<string, Quote> = new Map()
  private lastUpdateTime: number = 0
  private lastError: string | null = null
  private isPolling: boolean = false
  private calendarConfig: TradingCalendarConfig = DEFAULT_CALENDAR

  constructor(provider: QuoteProvider, config?: Partial<QuotePollingConfig>) {
    this.provider = provider
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 启动轮询
   */
  async start(): Promise<void> {
    if (this.isPolling) return
    this.isPolling = true
    console.log('[quote] Polling started')
    try {
      const db = await getDb()
      this.calendarConfig = getTradingCalendar(db)
    } catch (err) {
      console.error('[quote] Failed to load trading calendar, using default:', err)
    }
    this.scheduleNextPoll()
  }

  /**
   * 重新从数据库加载交易日历配置（设置变更后调用）
   */
  async reloadCalendar(): Promise<void> {
    try {
      const db = await getDb()
      this.calendarConfig = getTradingCalendar(db)
    } catch (err) {
      console.error('[quote] Failed to reload trading calendar:', err)
    }
  }

  /**
   * 停止轮询
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.isPolling = false
    console.log('[quote] Polling stopped')
  }

  /**
   * 立即刷新一次行情
   */
  async refresh(): Promise<void> {
    await this.pollOnce()
  }

  /**
   * 获取最新行情
   */
  getLatestQuotes(): { quotes: Quote[]; timestamp: number; error: string | null } {
    return {
      quotes: Array.from(this.lastQuotes.values()),
      timestamp: this.lastUpdateTime,
      error: this.lastError,
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<QuotePollingConfig>): void {
    this.config = { ...this.config, ...config }
    if (this.isPolling && this.timer) {
      clearTimeout(this.timer)
      this.scheduleNextPoll()
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isPolling) return

    ;(async () => {
      const db = await getDb()
      const symbols = getAllSymbols(db)
      if (this.config.stopWhenEmpty && symbols.length === 0) {
        // 没有自选股，10 秒后再检查
        this.timer = setTimeout(() => this.scheduleNextPoll(), 10000)
        return
      }

      const interval = this.isTradingHours()
        ? this.config.tradingIntervalMs
        : this.config.nonTradingIntervalMs

      this.timer = setTimeout(() => {
        this.pollOnce().then(() => this.scheduleNextPoll())
      }, interval)
    })()
  }

  private async pollOnce(): Promise<void> {
    try {
      const db = await getDb()
      const symbols = getAllSymbols(db)
      if (symbols.length === 0) return

      const quotes = await this.provider.getQuotes(symbols)
      this.lastError = null
      this.lastUpdateTime = Date.now()

      // 更新缓存
      for (const q of quotes) {
        this.lastQuotes.set(q.symbol, q)
      }

      // 落库行情历史（供走势回放 / 复盘对照；空行情时不写入）
      try {
        addQuoteHistoryBatch(db, quotes)
      } catch (historyErr) {
        console.error('[quote] Failed to persist quote history:', historyErr)
      }

      // 推送给所有渲染进程窗口
      this.broadcastQuotes()
    } catch (err: any) {
      this.lastError = err?.message || String(err)
      console.error(`[quote] Poll failed: ${this.lastError}`)
      // 出错时也推送通知（带错误标记）
      this.broadcastQuotes()
    }
  }

  private broadcastQuotes(): void {
    const payload = this.getLatestQuotes()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.QUOTES_UPDATED, payload)
      }
    }
  }

  /**
   * 判断当前是否为 A 股交易时段
   * 周一至周五：9:30-11:30, 13:00-15:00
   * 同时受交易日历约束（节假日休市、调休补班开市）
   */
  isTradingHours(): boolean {
    return isTradingHoursFn(new Date(), this.calendarConfig)
  }
}
