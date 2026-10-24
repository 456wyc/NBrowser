/**
 * 行情数据源的展示名
 *
 * 主进程只认识 provider id（eastmoney / tencent / custom），
 * 界面上出现的地方（设置卡片、自选股顶部的降级提示）共用这一份映射，
 * 避免「有的地方写东财、有的地方写东方财富」。
 */

export const QUOTE_SOURCE_LABELS: Record<string, string> = {
  eastmoney: '东方财富',
  tencent: '腾讯财经',
  custom: '自定义 API',
}

/** 数据源 id → 展示名；未知源原样返回（新增数据源时不必先改这里） */
export function quoteSourceLabel(id: string | undefined | null): string {
  if (!id) return '未知数据源'
  return QUOTE_SOURCE_LABELS[id] ?? id
}
