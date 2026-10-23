import { useEffect, useState } from 'react'
import { IPC_CHANNELS, type Tab } from '@shared/ipc'

/**
 * 标签列表 Hook
 * - 初次加载全量标签
 * - 订阅主进程推送的标签变化（导航、增删、切换、标题更新）
 */
export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.TABS_GET_ALL, {})
        if (!mounted) return
        setTabs(res.tabs)
        setActiveTabId(res.activeTabId)
      } catch (err) {
        console.error('Failed to load tabs:', err)
      }
    }

    load()

    const unsubscribe = window.electronAPI.onTabsUpdated((payload) => {
      setTabs(payload.tabs)
      setActiveTabId(payload.activeTabId)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  return { tabs, activeTabId, activeTab }
}
