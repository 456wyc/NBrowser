/**
 * 主题模式（深色 / 浅色）
 *
 * - 取值与默认（Catppuccin Mocha 深色）写在 styles/global.css 的 :root；
 *   浅色覆盖写在同文件的 [data-theme="light"]。
 * - 同步架构（单一写入方，避免多方 THEME_SET 互相覆盖造成各区域深浅不一）：
 *   · 主壳（App，authoritative）是唯一写入方：切换时 THEME_SET 通知主进程，
 *     主进程记住当前主题、更新原生窗口控制按钮配色，并广播 THEME_UPDATED 给所有 webContents；
 *   · 其它实例（新标签页 WebContentsView、面板内组件）只读：挂载时 THEME_GET 对齐主进程，
 *     并订阅 THEME_UPDATED 跟随；绝不调用 THEME_SET。
 * - 各空间标签用独立 session partition，localStorage 不互通、storage 事件跨不过分区，
 *   因此跨文档同步只能走主进程中转；localStorage 仅用于 index.html 内联脚本防白屏闪烁。
 * - 进入应用时由 index.html 的内联脚本抢先设置 data-theme，避免白屏闪烁。
 */

import { useEffect, useState, useCallback } from 'react'
import { IPC_CHANNELS, type ThemeMode } from '@shared/ipc'

export type { ThemeMode }

const THEME_KEY = 'app.theme'

export function readInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  // 未设置时跟随系统
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
}

export function useThemeMode(
  options: { /** 主壳实例：唯一允许 THEME_SET 的写入方 */ authoritative?: boolean } = {}
): {
  mode: ThemeMode
  toggle: () => void
  setTheme: (m: ThemeMode) => void
} {
  const { authoritative = false } = options
  const [mode, setMode] = useState<ThemeMode>(() => readInitialTheme())

  // 应用到本文档；主壳额外通知主进程（记主题 + 原生按钮配色 + 广播），其它实例静默应用
  useEffect(() => {
    applyTheme(mode)
    if (authoritative) {
      window.electronAPI?.invoke(IPC_CHANNELS.THEME_SET, { mode }).catch(() => {})
    }
  }, [mode, authoritative])

  // 跟随主进程广播（任一处切换 / 主壳启动时都会触发；同值 setMode 不触发 effect，无循环）
  useEffect(() => {
    const off = window.electronAPI?.onThemeUpdated?.((p) => {
      if (p.mode === 'dark' || p.mode === 'light') setMode(p.mode)
    })
    return () => off?.()
  }, [])

  // 非权威实例挂载时向主进程对齐（主进程在运行期始终是事实标准）。
  // 注意必须无条件查询：本实例初次 applyTheme 已把回退值写进 localStorage，
  // 若以「本地有无存储」为条件，查询会被永远跳过（此前的 bug）。
  useEffect(() => {
    if (authoritative) return
    window.electronAPI
      ?.invoke(IPC_CHANNELS.THEME_GET, undefined)
      .then((res) => {
        if (res?.mode === 'dark' || res?.mode === 'light') setMode(res.mode)
      })
      .catch(() => {})
  }, [authoritative])

  // 同 partition 其它文档的兜底（storage 事件只在键被其它文档修改时触发）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setMode(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'))
  }, [])

  const setTheme = useCallback((m: ThemeMode) => setMode(m), [])

  return { mode, toggle, setTheme }
}
