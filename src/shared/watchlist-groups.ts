import { normalizeSymbol } from './stock-market'

/** 分组类型：自定义分组 / 智能（系统虚拟）分组 */
export type WatchlistGroupKind = 'custom' | 'smart'

/**
 * 智能分组定义（系统内置，不可删除）
 * rule 字段用于主进程播种与渲染端过滤判断
 */
export interface SmartGroupDef {
  name: string
  rule: string
}

export const SMART_GROUPS: SmartGroupDef[] = [
  { name: '沪市', rule: 'market:SH' },
  { name: '深市', rule: 'market:SZ' },
  { name: '创业板', rule: 'board:CYB' },
  { name: '科创板', rule: 'board:KCB' },
  { name: '上涨', rule: 'change:up' },
  { name: '下跌', rule: 'change:down' },
]

/** 特殊分组 id（非数据库真实 id） */
export const GROUP_ALL = -1
export const GROUP_UNGROUPED = 0

/**
 * 判断某股票是否命中智能分组规则
 * @param rule   智能分组规则（如 'market:SH' / 'board:CYB' / 'change:up'）
 * @param symbol 股票代码（任意格式，内部会规范化）
 * @param changePercent 当日涨跌幅（percent），用于 change:* 规则；为 null 时不命中涨跌类规则
 */
export function matchSmartGroup(
  rule: string,
  symbol: string,
  changePercent: number | null
): boolean {
  const norm = normalizeSymbol(symbol)
  const code = norm.split('.')[0]

  switch (rule) {
    case 'market:SH':
      return norm.endsWith('.SH')
    case 'market:SZ':
      return norm.endsWith('.SZ')
    case 'board:CYB':
      // 创业板：300 / 301
      return /^30[01]/.test(code)
    case 'board:KCB':
      // 科创板：688 / 689
      return /^68[89]/.test(code)
    case 'change:up':
      return changePercent != null && changePercent > 0
    case 'change:down':
      return changePercent != null && changePercent < 0
    default:
      return false
  }
}
