import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { Database } from 'sql.js'
import type { Note } from '@shared/ipc'
import { normalizeSymbol } from '@shared/stock-market'
import { addToWatchlist } from '../db/watchlist'
import { saveNote } from '../db/notes'

/**
 * Copilot 行动工具（写操作）
 *
 * 每个工具执行前都先走 requestConfirmation 请求用户确认——
 * 主进程会推送 action_confirm 事件，渲染端弹出确认卡片，
 * 用户点「确认执行」后 Promise resolve(true) 才真正落库；
 * 取消 / 超时 resolve(false)，工具返回取消原因给模型，让它改口告知用户。
 */

export interface ActionToolDeps {
  getDb: () => Promise<Database>
  /** 请求用户确认；resolve(true)=已确认，false=取消或超时 */
  requestConfirmation: (tool: string, args: Record<string, unknown>) => Promise<boolean>
  /** 自选股写入后的副作用（行情刷新 + 广播），由 IPC 层提供 */
  afterWatchlistAdd: (symbol: string, name: string) => void
  /** 笔记写入后的副作用（md 镜像同步 + 向量 + 广播），由 IPC 层提供 */
  afterNoteSaved: (note: Note) => void
}

export function buildActionTools(deps: ActionToolDeps): DynamicStructuredTool[] {
  const addToWatchlistTool = new DynamicStructuredTool({
    name: 'add_to_watchlist',
    description:
      '把一只股票加入用户的自选股。需要用户确认后执行。symbol 支持 600519 / 600519.SH / 000001 等格式；name 为股票名称（不知道可留空，用代码代替）。',
    schema: z.object({
      symbol: z.string().describe('股票代码，如 600519、600519.SH、000001'),
      name: z.string().optional().describe('股票名称，如 贵州茅台（可留空）'),
    }),
    func: async ({ symbol, name }) => {
      const normalized = normalizeSymbol(symbol.trim())
      const ok = await deps.requestConfirmation('add_to_watchlist', { symbol: normalized, name })
      if (!ok) return '用户取消了该操作，未加入自选股。'
      try {
        const db = await deps.getDb()
        const item = addToWatchlist(db, {
          symbol: normalized,
          name: name?.trim() || normalized,
          groupId: 0,
        })
        deps.afterWatchlistAdd(item.symbol, item.name)
        return `已将 ${item.name}（${item.symbol}）加入自选股。`
      } catch (err: any) {
        return `加入自选股失败：${err?.message || String(err)}`
      }
    },
  })

  const createNoteTool = new DynamicStructuredTool({
    name: 'create_note',
    description:
      '创建一条笔记（Markdown 正文，会自动镜像为 .md 文件）。需要用户确认后执行。适合把研究结论、待办、要点记录到用户的个人知识库。',
    schema: z.object({
      title: z.string().describe('笔记标题'),
      content: z.string().describe('笔记正文（Markdown）'),
    }),
    func: async ({ title, content }) => {
      const ok = await deps.requestConfirmation('create_note', { title, content })
      if (!ok) return '用户取消了该操作，未创建笔记。'
      try {
        const db = await deps.getDb()
        const note = saveNote(db, { title: title.trim() || '未命名笔记', content })
        deps.afterNoteSaved(note)
        return `已创建笔记《${note.title}》（id=${note.id}）。`
      } catch (err: any) {
        return `创建笔记失败：${err?.message || String(err)}`
      }
    },
  })

  return [addToWatchlistTool, createNoteTool]
}
