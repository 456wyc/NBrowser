import type { WebContents } from 'electron'
import type { Database } from 'sql.js'
import { extractStockFromUrl } from '../stock-extractor'
import { addPageVisit, updateVisitDuration } from '../db/page-visits'
import { isTrackingEnabled, isUrlBlacklisted } from '../db/settings'

/**
 * 跟踪单个 WebContents 的页面访问
 * 记录每个页面的 URL、标题、开始时间、停留时长
 */
export class PageVisitTracker {
  private db: Database
  private space: string
  private webContents: WebContents
  private currentVisitId: number | null = null
  private currentUrl: string = ''
  private currentStartTime: number = 0
  private listeners: Array<() => void> = []

  constructor(db: Database, webContents: WebContents, space: string) {
    this.db = db
    this.webContents = webContents
    this.space = space

    this.attachListeners()
  }

  private attachListeners(): void {
    const wc = this.webContents

    // 页面开始导航（主框架）
    const onDidStartNavigation = (event: any, url: string) => {
      if (event.frameId !== 0) return // 只关心主框架
      this.handleNavigationStart(url)
    }

    // 页面导航完成
    const onDidNavigate = (event: any, url: string) => {
      if (event.frameId !== 0) return
      this.handleNavigationComplete(url, wc.getTitle())
    }

    wc.on('did-start-navigation', onDidStartNavigation)
    wc.on('did-navigate', onDidNavigate)

    this.listeners.push(() => {
      wc.off('did-start-navigation', onDidStartNavigation)
      wc.off('did-navigate', onDidNavigate)
    })
  }

  private handleNavigationStart(url: string): void {
    // 结束上一个页面的计时
    this.finalizeCurrentVisit()
    this.currentUrl = url
    this.currentStartTime = Date.now()
  }

  private handleNavigationComplete(url: string, title: string): void {
    // 检查是否启用跟踪
    if (!isTrackingEnabled(this.db)) {
      this.currentVisitId = null
      return
    }

    // 检查黑名单
    if (isUrlBlacklisted(this.db, url)) {
      this.currentVisitId = null
      return
    }

    // 从 URL 提取股票代码
    const symbol = extractStockFromUrl(url)

    // 新建访问记录（写库失败打日志，不静默丢数据）
    try {
      this.currentVisitId = addPageVisit(this.db, {
        url,
        title: title || null,
        symbol,
        space: this.space,
        started_at: this.currentStartTime || Date.now(),
      })
    } catch (err) {
      console.error('[tracker] Failed to record page visit:', url, err)
      this.currentVisitId = null
    }
  }

  /**
   * 结束当前页面的访问记录（计算停留时长）
   */
  private finalizeCurrentVisit(): void {
    if (this.currentVisitId !== null && this.currentStartTime > 0) {
      const duration = Date.now() - this.currentStartTime
      if (duration > 0) {
        updateVisitDuration(this.db, this.currentVisitId, duration)
      }
      this.currentVisitId = null
    }
  }

  /**
   * 销毁跟踪器（标签关闭时调用）
   */
  destroy(): void {
    this.finalizeCurrentVisit()
    this.listeners.forEach((remove) => remove())
    this.listeners = []
  }
}
