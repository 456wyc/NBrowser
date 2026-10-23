import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS, type Quote, type QuotesUpdate } from '@shared/ipc'

/**
 * 行情数据 Hook
 * - 初始获取最新行情
 * - 订阅主进程推送的行情更新
 * - 提供手动刷新方法
 */
export function useQuotes() {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [timestamp, setTimestamp] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 初始加载
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.QUOTES_GET_LATEST, {})
        if (!mounted) return
        setQuotes(new Map(res.quotes.map((q) => [q.symbol, q])))
        setTimestamp(res.timestamp)
        setError(res.error)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // 订阅行情更新
  useEffect(() => {
    const handleUpdate = (update: QuotesUpdate) => {
      setQuotes(new Map(update.quotes.map((q) => [q.symbol, q])))
      setTimestamp(update.timestamp)
      setError(update.error)
      setLoading(false)
    }

    const unsubscribe = window.electronAPI.onQuotesUpdated(handleUpdate)
    return unsubscribe
  }, [])

  // 手动刷新
  const refresh = useCallback(async () => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.QUOTES_REFRESH, {})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return {
    quotes,
    timestamp,
    error,
    loading,
    refresh,
  }
}
