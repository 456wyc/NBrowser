import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS, type Space, type SpaceId } from '@shared/ipc'

/** 空间列表变更后广播的自定义事件，渲染进程内各订阅方据此重新拉取 */
export const SPACES_CHANGED_EVENT = 'spaces:changed'

export function notifySpacesChanged() {
  window.dispatchEvent(new Event(SPACES_CHANGED_EVENT))
}

/**
 * 拉取空间列表（含自定义空间），并在空间被增/删/改名后通过
 * `SPACES_CHANGED_EVENT` 事件统一刷新。所有用到空间列表的组件共用本 hook。
 */
export function useSpaces() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<SpaceId>('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.SPACES_GET_ALL, {})
      setSpaces(res.spaces)
      setActiveSpaceId(res.activeSpaceId)
      setError(null)
    } catch (err) {
      console.error('Failed to load spaces:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(SPACES_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(SPACES_CHANGED_EVENT, onChange)
  }, [refresh])

  return { spaces, activeSpaceId, error, refresh }
}
