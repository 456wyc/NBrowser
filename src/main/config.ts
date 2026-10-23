import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { defaultCapabilities, type AgentCapabilitiesConfig } from '@shared/agent-capabilities'

/**
 * 应用配置（存本地 JSON 文件，不入库、不提交 git）
 * 主要存放 API Key 等敏感信息
 */
export interface AppConfig {
  // LLM 配置
  llm: {
    baseUrl: string
    apiKey: string
    model: string
  }
  // 行情配置
  quote: {
    provider: string
    tradingIntervalMs: number
    nonTradingIntervalMs: number
  }
  // Agent 能力配置（工具 / Skills / MCP）
  agent: AgentCapabilitiesConfig
}

const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  quote: {
    provider: 'eastmoney',
    tradingIntervalMs: 5000,
    nonTradingIntervalMs: 60000,
  },
  agent: defaultCapabilities(),
}

let cachedConfig: AppConfig | null = null

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

/**
 * 加载配置（带缓存）
 */
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig

  const configPath = getConfigPath()
  let loaded: AppConfig

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8')
      const userConfig = JSON.parse(raw)
      loaded = deepMerge(DEFAULT_CONFIG, userConfig)
    } catch (err) {
      console.error('[config] Failed to load config, using defaults:', err)
      loaded = { ...DEFAULT_CONFIG }
    }
  } else {
    loaded = { ...DEFAULT_CONFIG }
    // 首次启动写入默认配置（带注释说明，用户自己编辑）
    saveConfig(loaded)
  }

  cachedConfig = loaded
  return loaded
}

/**
 * 保存配置
 */
export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath()
  cachedConfig = config
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[config] Failed to save config:', err)
  }
}

/**
 * 更新部分配置（合并）
 */
export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getConfig()
  const updated = deepMerge(current, partial)
  saveConfig(updated)
  return updated
}

/**
 * 深合并配置（只合并对象，数组直接替换）
 */
function deepMerge(base: any, override: any): any {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}
