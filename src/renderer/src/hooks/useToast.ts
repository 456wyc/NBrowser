import { useCallback, useEffect, useState } from 'react'

export interface ToastState {
  text: string
  ok: boolean
}

/**
 * 页面内轻量提示（自动消失）。样式统一走全局 .toast / .toast-error，
 * 避免各页各写一套 state，也避免用原生 alert 打断操作。
 */
export function useToast(duration = 2200) {
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), duration)
    return () => clearTimeout(timer)
  }, [toast, duration])

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok })
  }, [])

  const clearToast = useCallback(() => setToast(null), [])

  return { toast, showToast, clearToast }
}
