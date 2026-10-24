/**
 * Copilot 行动层（Action Tools）共享定义
 *
 * 原则：读操作免确认，写操作必须经用户确认后执行。
 * 主进程在执行写工具前通过 agent:stream 推送 action_confirm 事件，
 * 渲染端弹出确认卡片，用户点「确认执行」后才真正落库。
 */

/** 行动工具名（与 action-tools.ts 注册的工具对应） */
export const ACTION_TOOL_NAMES = ['add_to_watchlist', 'create_note'] as const

export type ActionToolName = (typeof ACTION_TOOL_NAMES)[number]

export function isActionTool(name: string): name is ActionToolName {
  return (ACTION_TOOL_NAMES as readonly string[]).includes(name)
}

/**
 * 生成确认卡片用的人类可读摘要（纯函数）。
 * 目标是让用户一眼看清「AI 要对我数据做什么」，再决定是否放行。
 */
export function summarizeAction(tool: string, args: Record<string, unknown>): string {
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback

  switch (tool) {
    case 'add_to_watchlist': {
      const symbol = str(args.symbol, '（未提供代码）')
      const name = str(args.name)
      return name ? `将 ${name}（${symbol}）加入自选股` : `将 ${symbol} 加入自选股`
    }
    case 'create_note': {
      const title = str(args.title, '未命名笔记')
      const content = str(args.content)
      const preview = content.length > 40 ? `${content.slice(0, 40)}…` : content
      return preview ? `创建笔记《${title}》：${preview}` : `创建笔记《${title}》`
    }
    default:
      return `执行操作 ${tool}`
  }
}
