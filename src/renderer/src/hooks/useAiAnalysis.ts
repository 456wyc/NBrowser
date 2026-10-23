import { useState, useCallback, useEffect } from 'react'
import { IPC_CHANNELS, type AiAnalysisView } from '@shared/ipc'

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '分析失败，请稍后重试'
}

/**
 * AI 分析 Hook
 * - 分析当前页面 / 分析给定文本
 * - 拉取历史记录、删除记录
 */
export function useAiAnalysis() {
  const [result, setResult] = useState<AiAnalysisView | null>(null)
  const [history, setHistory] = useState<AiAnalysisView[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 订阅主进程推送（右键菜单「整理选中文本」的结果）
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAiAnalysisDone((payload) => {
      if (payload.error) {
        setError(payload.error)
        return
      }
      if (payload.result) {
        setError(null)
        setResult(payload.result)
      }
    })
    return unsubscribe
  }, [])

  const analyzePage = useCallback(async (tabId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_ANALYZE_PAGE, {
        ...(tabId ? { tabId } : {}),
      })
      setResult(res.result)
      return res.result
    } catch (err) {
      setError(errMessage(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const analyzeText = useCallback(async (text: string, title?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_ANALYZE_TEXT, {
        text,
        ...(title ? { title } : {}),
      })
      setResult(res.result)
      return res.result
    } catch (err) {
      setError(errMessage(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (symbol?: string, limit = 20) => {
    setLoadingHistory(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_GET_HISTORY, {
        ...(symbol ? { symbol } : {}),
        limit,
      })
      setHistory(res.records)
    } catch (err) {
      console.error('Failed to load AI history:', err)
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const deleteRecord = useCallback(async (id: number) => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_DELETE_RECORD, { id })
      setHistory((prev) => prev.filter((r) => r.id !== id))
      setResult((prev) => (prev && prev.id === id ? null : prev))
      return true
    } catch (err) {
      console.error('Failed to delete AI record:', err)
      return false
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  const clearResult = useCallback(() => setResult(null), [])

  return {
    result,
    history,
    loading,
    loadingHistory,
    error,
    analyzePage,
    analyzeText,
    loadHistory,
    deleteRecord,
    clearError,
    clearResult,
  }
}
