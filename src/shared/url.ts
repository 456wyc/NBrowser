/**
 * 地址栏输入 -> 可导航 URL（主进程与渲染进程共用，保证行为一致）
 *
 * 规则（与浏览器地址栏一致）：
 * - 已经是 http(s) 链接：原样使用
 * - 像域名（含点、无空格）：补全 https://
 * - 其它：当作搜索词走百度
 *
 * 纯函数：相同输入永远返回相同输出，无副作用。
 * 空输入返回空字符串，由调用方决定降级行为（如跳导航首页）。
 */
export function toNavigableUrl(input: string, searchTemplate = DEFAULT_SEARCH_TEMPLATE): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  // 判断是否像一个 URL：显式协议，或形如 example.com 的域名
  const looksLikeUrl = /^(https?:\/\/|[\w-]+\.[\w.-]+)/i.test(trimmed)
  if (looksLikeUrl) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  }

  return buildSearchUrl(searchTemplate, trimmed)
}

/** 内置搜索引擎预设（%s 为搜索词占位符） */
export const SEARCH_ENGINE_PRESETS: Array<{ id: string; name: string; template: string }> = [
  { id: 'baidu', name: '百度', template: 'https://www.baidu.com/s?wd=%s' },
  { id: 'bing', name: '必应', template: 'https://www.bing.com/search?q=%s' },
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'sogou', name: '搜狗', template: 'https://www.sogou.com/web?query=%s' },
  { id: 'ddg', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
]

/** 默认搜索模板（百度）。设置里可改，存库的就是模板本身 */
export const DEFAULT_SEARCH_TEMPLATE = SEARCH_ENGINE_PRESETS[0].template

/** 用搜索模板构造搜索 URL；模板非法时回退默认（保证永远能搜） */
export function buildSearchUrl(template: string, query: string): string {
  const t = typeof template === 'string' && template.includes('%s') ? template : DEFAULT_SEARCH_TEMPLATE
  return t.replace('%s', encodeURIComponent(query))
}

/** 从搜索模板提取引擎站点名（用于建议列表展示，如「百度」「必应」） */
export function searchEngineName(template: string): string {
  try {
    return new URL(template).hostname.replace(/^www\./, '').split('.')[0]
  } catch {
    return '搜索'
  }
}

/**
 * 判断是否为应用内部的「新标签页」（导航首页 #/nav）
 * 地址栏对这类 URL 显示为空（浏览器对自身新标签页也不显示内部地址）
 */
export function isNavHomeUrl(url: string): boolean {
  if (!url) return false
  try {
    return new URL(url).hash.startsWith('#/nav')
  } catch {
    return url.includes('#/nav')
  }
}
