import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z, type ZodTypeAny } from 'zod'
import type { McpServerConfig } from '@shared/agent-capabilities'

/**
 * 极简 MCP 客户端（仅实现 stdio 传输）
 *
 * 走 JSON-RPC 2.0 的换行分隔协议：
 *   initialize -> (收到结果) -> notifications/initialized
 *   tools/list  -> 列出工具
 *   tools/call  -> 调用工具
 * 把每个远程工具包装成 LangChain 的 DynamicStructuredTool，供 DeepResearchAgent 直接 bind。
 */

const REQUEST_TIMEOUT_MS = 20000

interface McpToolDef {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, any>
    required?: string[]
  }
}

export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: ReturnType<typeof createInterface> | null = null
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }
  >()
  private connected = false

  constructor(private cfg: McpServerConfig) {}

  async connect(): Promise<void> {
    if (this.cfg.transport !== 'stdio' || !this.cfg.command) {
      throw new Error('仅支持 stdio 传输的 MCP 服务器（需配置 command）')
    }

    const proc = spawn(this.cfg.command, this.cfg.args || [], {
      env: { ...process.env, ...(this.cfg.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams
    this.proc = proc
    proc.stdout.setEncoding('utf-8')
    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (d) => console.error(`[mcp:${this.cfg.name}]`, d.toString().trim()))

    this.rl = createInterface({ input: proc.stdout })
    this.rl.on('line', (line) => this.onLine(line))

    const onExit = (code?: number | null) => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer)
        p.reject(new Error(`MCP 服务器「${this.cfg.name}」已退出（code=${code}）`))
      }
      this.pending.clear()
      this.connected = false
    }
    proc.on('error', (err) => onExit())
    proc.on('exit', (code) => onExit(code))

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'NBrowser', version: '0.1.0' },
    })
    this.notify('notifications/initialized', {})
    this.connected = true
  }

  private onLine(line: string): void {
    const text = line.trim()
    if (!text) return
    let msg: any
    try {
      msg = JSON.parse(text)
    } catch {
      return // 非 JSON 行（部分服务器会打印日志）直接忽略
    }
    if (typeof msg.id !== 'number') return // 通知，无需响应
    const p = this.pending.get(msg.id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(msg.id)
    if (msg.error) p.reject(new Error(`[mcp] ${msg.error.message || '未知错误'}`))
    else p.resolve(msg.result)
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        reject(new Error('MCP 未连接'))
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP 请求超时：${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      this.proc.stdin.write(payload)
    })
  }

  private notify(method: string, params: any): void {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    this.proc?.stdin.write(payload)
  }

  async listToolDefs(): Promise<McpToolDef[]> {
    if (!this.connected) throw new Error('MCP 未连接')
    const res = await this.request('tools/list', {})
    return res?.tools || []
  }

  async listTools(): Promise<DynamicStructuredTool[]> {
    const defs = await this.listToolDefs()
    return defs.map((d) => this.toLangchainTool(d))
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.request('tools/call', { name, arguments: args || {} })
  }

  private toLangchainTool(def: McpToolDef): DynamicStructuredTool {
    const schema = jsonSchemaToZod(def.inputSchema)
    const prefix = this.cfg.name ? `${sanitize(this.cfg.name)}__` : ''
    return new DynamicStructuredTool({
      name: `${prefix}${sanitize(def.name)}`,
      description: def.description || def.name,
      schema,
      func: async (input: any) => {
        try {
          const r = await this.callTool(def.name, input)
          return formatToolResult(r)
        } catch (err: any) {
          return `MCP 工具调用失败：${err?.message || err}`
        }
      },
    })
  }

  async disconnect(): Promise<void> {
    try {
      this.proc?.stdin.end()
    } catch {
      /* noop */
    }
    try {
      this.proc?.kill()
    } catch {
      /* noop */
    }
    try {
      this.rl?.close()
    } catch {
      /* noop */
    }
    this.connected = false
  }
}

/**
 * 测试 MCP 服务器连通性并列出可用工具（不进入主研究流程）。
 * 设置页「测试连接」按钮调用，便于在保存前验证服务器是否真的能拉到工具。
 */
export async function testMcpServer(
  cfg: McpServerConfig
): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  if (!cfg.command || !cfg.command.trim()) {
    return { ok: false, tools: [], error: '未填写启动命令（command）' }
  }
  const client = new McpClient(cfg)
  try {
    await client.connect()
    const defs = await client.listToolDefs()
    return { ok: true, tools: defs.map((d) => d.name) }
  } catch (err: any) {
    return { ok: false, tools: [], error: err?.message || String(err) }
  } finally {
    try {
      await client.disconnect()
    } catch {
      /* noop */
    }
  }
}

/** 把 MCP 工具的 JSON Schema 转成 zod schema */
function jsonSchemaToZod(schema: McpToolDef['inputSchema']): ZodTypeAny {
  const s = schema || {}
  if (s.type === 'object' && s.properties) {
    const shape: Record<string, ZodTypeAny> = {}
    const required: string[] = s.required || []
    for (const key of Object.keys(s.properties)) {
      const prop = s.properties[key]
      let zod = toZodPrimitive(prop)
      if (!required.includes(key)) zod = zod.optional()
      shape[key] = zod
    }
    return z.object(shape)
  }
  if (s.type === 'array') return z.array(z.any())
  return z.object({}).passthrough()
}

function toZodPrimitive(p: any): ZodTypeAny {
  switch (p?.type) {
    case 'string':
      return z.string()
    case 'number':
    case 'integer':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(z.any())
    case 'object':
      return z.object({}).passthrough()
    default:
      return z.any()
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '')
}

/** 把 MCP 工具的返回结果格式化为字符串（LangChain 工具返回值） */
function formatToolResult(r: any): string {
  const content = r?.content
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c?.type === 'text' ? c.text : JSON.stringify(c)))
      .join('\n')
  }
  return JSON.stringify(r)
}
