import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { runInHeadlessPage } from '../browser/headless-page'
import { extractPageContent } from '../browser/content-extractor'
import type { BrowserWindow } from 'electron'
import type { CustomTool } from '@shared/agent-capabilities'

/** 自定义工具所需的运行依赖（避免与 deep-agent 形成循环依赖） */
export interface CustomToolDeps {
  getWindow: () => BrowserWindow
}

/**
 * 把一条「自定义工具」配置包装成 LangChain 工具：
 * - url：把 {query} 拼进 URL 模板后无头加载并抽取正文
 * - prompt：调用时直接返回固定指令，引导模型按既定流程分析
 */
export function buildCustomTool(cfg: CustomTool, deps: CustomToolDeps): DynamicStructuredTool {
  const baseName = sanitize(cfg.name) || `custom_${cfg.id.slice(0, 6)}`

  if (cfg.kind === 'url') {
    return new DynamicStructuredTool({
      name: baseName,
      description: cfg.description || `自定义工具：${cfg.name}`,
      schema: z.object({
        query: z.string().describe('查询词，会拼接到目标 URL 模板的 {query} 位置'),
      }),
      func: async ({ query }: { query: string }) => {
        const url = (cfg.urlTemplate || '').replace(/\{query\}/g, encodeURIComponent(query))
        if (!/^https?:\/\//i.test(url)) {
          return JSON.stringify({ error: '自定义工具未配置合法 URL 模板' })
        }
        try {
          return await runInHeadlessPage(deps.getWindow(), url, async (wc) => {
            const c = await extractPageContent(wc)
            return JSON.stringify(
              { url, title: c.title, mainText: (c.text || '').slice(0, 4000) },
              null,
              2
            )
          })
        } catch (err: any) {
          return `自定义工具抓取失败：${err?.message || err}`
        }
      },
    })
  }

  return new DynamicStructuredTool({
    name: baseName,
    description: cfg.description || `自定义指令工具：${cfg.name}`,
    schema: z.object({}),
    func: async () => cfg.prompt || '(无指令内容)',
  })
}

function sanitize(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '')
}
