/**
 * Agent 能力配置（工具 / Skills / MCP）
 *
 * 这些配置存于本地 config.json 的 `agent` 字段，由「Agent 能力」设置页管理。
 * 主进程在启动深度研究代理时读取，决定给模型开放哪些工具、引入哪些外部 MCP 工具。
 */

/** 内置工具（硬编码在 deep-agent 中）的开关与描述覆盖 */
export interface BuiltinToolOverride {
  enabled: boolean
  description?: string
}

/** 自定义工具类型 */
export type CustomToolKind = 'url' | 'prompt'

/**
 * 用户自定义工具：
 * - url：把 {query} 拼进 URL 模板后无头加载并抽取正文（适合接入自有数据源）
 * - prompt：调用时直接返回一段固定指令，引导模型按既定流程分析
 */
export interface CustomTool {
  id: string
  name: string
  description: string
  kind: CustomToolKind
  urlTemplate?: string
  prompt?: string
}

/** 分析模板 / 工作流，供 Agent 一键调用（预填到输入框） */
export interface Skill {
  id: string
  name: string
  description: string
  prompt: string
}

/** MCP 服务器传输方式（当前仅实现 stdio） */
export type McpTransport = 'stdio' | 'sse'

/** 一个外部 MCP 服务器配置 */
export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  transport: McpTransport
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // sse（预留，本期未接入）
  url?: string
}

/** 完整的 Agent 能力配置 */
export interface AgentCapabilitiesConfig {
  builtinTools: Record<string, BuiltinToolOverride>
  customTools: CustomTool[]
  skills: Skill[]
  mcpServers: McpServerConfig[]
}

/** 内置工具名称常量（与 deep-agent.buildBaseTools 对应） */
export const BUILTIN_TOOL_NAMES = [
  'web_search',
  'fetch_stock_quote',
  'fetch_stock_announcements',
  'open_and_read',
  'analyze_current_page',
] as const

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[number]

/** 生成默认能力配置：所有内置工具开启，无自定义工具 / Skills / MCP */
export function defaultCapabilities(): AgentCapabilitiesConfig {
  const builtinTools: Record<string, BuiltinToolOverride> = {}
  for (const n of BUILTIN_TOOL_NAMES) builtinTools[n] = { enabled: true }
  return {
    builtinTools,
    customTools: [],
    skills: [],
    mcpServers: [],
  }
}
