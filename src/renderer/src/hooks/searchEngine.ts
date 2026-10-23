import { IPC_CHANNELS } from '@shared/ipc'
import { DEFAULT_SEARCH_TEMPLATE } from '@shared/url'

/**
 * 默认搜索引擎模板（渲染端缓存）
 *
 * 设置页保存后调 setSearchEngineCache 更新；AddressBar 的建议列表
 * 用 getSearchEngineTemplateSync 同步读取，保存即生效。
 */
let cached: string | null = null

/** 异步加载模板（应用启动时预热一次；失败回退默认） */
export async function fetchSearchEngineTemplate(): Promise<string> {
  try {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_GET_SEARCH_ENGINE, {})
    cached =
      typeof res?.template === 'string' && res.template.includes('%s')
        ? res.template
        : DEFAULT_SEARCH_TEMPLATE
  } catch {
    cached = DEFAULT_SEARCH_TEMPLATE
  }
  return cached
}

/** 同步读取（未加载完成时回退默认，保证建议列表可用） */
export function getSearchEngineTemplateSync(): string {
  return cached ?? DEFAULT_SEARCH_TEMPLATE
}

/** 设置页保存后更新缓存，立即生效 */
export function setSearchEngineCache(template: string): void {
  cached = template
}
