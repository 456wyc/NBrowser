import type { Quote, QuoteProvider } from './provider'
import type { Database } from 'sql.js'
import { EastmoneyProvider } from './eastmoney-provider'
import { getAllSymbols } from '../db/watchlist'
import { getDb } from '../db'
import { addQuoteHistoryBatch } from '../db/quote-history'
import { getTradingCalendar } from '../db/settings'
import {
  isQuoteActiveHours as isQuoteActiveHoursFn,
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
 * - 数据源可运行时切换；连续失败自动降级到东财（保底），恢复后手动切回
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
  /** 连续失败次数与降级状态 */
  private consecutiveFailures = 0
  private degraded = false
  /** 用户主动选择的数据源（降级时保留，恢复用） */
  private preferredProvider: QuoteProvider

  constructor(provider: QuoteProvider, config?: Partial<QuotePollingConfig>) {
    this.provider = provider
    this.preferredProvider = provider
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** 连续失败多少次后自动降级到东财 */
  private static readonly FAILOVER_THRESHOLD = 3

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
   * 运行时切换数据源（设置页保存后调用）。
   * 切换会重置失败计数与降级状态，并清空缓存避免新旧源数据混杂。
   */
  setProvider(provider: QuoteProvider): void {
    this.provider = provider
    this.preferredProvider = provider
    this.consecutiveFailures = 0
    this.degraded = false
    this.lastError = null
    console.log(`[quote] Provider switched to: ${provider.name}`)
    // 切换后立即拉一次，让用户马上看到新源是否可用
    void this.pollOnce()
  }

  /** 当前实际使用的数据源名（降级时为 eastmoney） */
  getSource(): { active: string; preferred: string; degraded: boolean } {
    return {
      active: this.provider.name,
      preferred: this.preferredProvider.name,
      degraded: this.degraded,
    }
  }

  /**
   * 获取最新行情
   */
  getLatestQuotes(): {
    quotes: Quote[]
    timestamp: number
    error: string | null
    source: string
    degraded: boolean
  } {
    return {
      quotes: Array.from(this.lastQuotes.values()),
      timestamp: this.lastUpdateTime,
      error: this.lastError,
      source: this.provider.name,
      degraded: this.degraded,
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

      const interval = this.isQuoteActive()
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
      this.consecutiveFailures = 0

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
      this.consecutiveFailures += 1
      console.error(
        `[quote] Poll failed (${this.consecutiveFailures}/${QuotePollingManager.FAILOVER_THRESHOLD}): ${this.lastError}`
      )
      // 连续失败达到阈值且尚未降级 → 自动切回东财保底
      if (
        !this.degraded &&
        this.provider.name !== 'eastmoney' &&
        this.consecutiveFailures >= QuotePollingManager.FAILOVER_THRESHOLD
      ) {
        this.provider = new EastmoneyProvider()
        this.degraded = true
        this.consecutiveFailures = 0
        console.warn('[quote] 数据源连续失败，已自动降级到东方财富')
      }
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
   * 判断当前是否需要按交易时段的高频拉取行情
   *
   * 连续竞价 9:30-11:30 / 13:00-15:00 **加上** 集合竞价 9:15-9:25 / 14:57-15:00：
   * 集合竞价期间报价一直在变，盯盘要看得到，否则要等到 9:30 才第一次刷新。
   * 仍受交易日历约束（节假日休市、调休补班开市）。
   * 策略信号不用这个口径（见 runner.ts，只认连续竞价）。
   */
  isQuoteActive(): boolean {
    return isQuoteActiveHoursFn(new Date(), this.calendarConfig)
  }
}
