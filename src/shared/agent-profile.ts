/**
 * AI 助手（Copilot）的用户画像上下文构建
 *
 * 纯函数：把用户的「自选股 / 持仓 / 研究轨迹」压成一段紧凑文本，
 * 注入系统提示，让助手回答带有个性化语境（它认识你）。
 *
 * 约束（token 预算）：
 * - 自选股最多 20 只、持仓最多 10 只、轨迹最多 5 只，超出截断并标注；
 * - 全部为空时返回空字符串——调用方据此整段省略，不浪费 token。
 */

export interface ProfileWatchItem {
  symbol: string
  name: string
  changePct: number | null
}

export interface ProfilePositionItem {
  symbol: string
  name: string
  quantity: number
  unrealizedPnl: number
}

export interface ProfileTrailItem {
  symbol: string
  durationMin: number
}

export interface UserProfileInput {
  watchlist: ProfileWatchItem[]
  positions: ProfilePositionItem[]
  trail: ProfileTrailItem[]
}

const WATCH_LIMIT = 20
const POSITION_LIMIT = 10
const TRAIL_LIMIT = 5

export function buildUserProfileText(input: UserProfileInput): string {
  const lines: string[] = []

  if (input.watchlist.length > 0) {
    const shown = input.watchlist.slice(0, WATCH_LIMIT)
    lines.push(
      `自选股（${shown.length}/${input.watchlist.length}）：` +
        shown.map((w) => `${w.name} ${w.symbol}${fmtPct(w.changePct)}`).join('；')
    )
  }

  if (input.positions.length > 0) {
    const shown = input.positions.slice(0, POSITION_LIMIT)
    lines.push(
      `持仓（${shown.length}/${input.positions.length}）：` +
        shown
          .map((p) => `${p.name} ${p.symbol} ${p.quantity}股 浮动盈亏${fmtNum(p.unrealizedPnl)}元`)
          .join('；')
    )
  }

  if (input.trail.length > 0) {
    const shown = input.trail.slice(0, TRAIL_LIMIT)
    lines.push(
      `近期研究较多：` + shown.map((t) => `${t.symbol}（${t.durationMin}分钟）`).join('；')
    )
  }

  if (lines.length === 0) return ''
  return `【用户画像】\n${lines.join('\n')}`
}

function fmtPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return ''
  return ` ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return (n > 0 ? '+' : '') + n.toFixed(0)
}
