import { LLMClient } from './llm-client'
import { getConfig } from '../config'
import { getStrategySystemPrompt, getStrategyUserPrompt } from './strategy-prompt'
import type {
  StrategyCondition,
  StrategyGenerateRequest,
  StrategyGenerateResponse,
  StrategyRuleConfig,
} from '@shared/ipc'

/**
 * 调用 LLM 把自然语言目标转成结构化规则配置。
 * 复用现有 LLMClient（net.fetch，key 只在主进程）。
 */
export async function generateStrategy(
  req: StrategyGenerateRequest
): Promise<StrategyGenerateResponse> {
  const goal = (req.goal || '').trim()
  if (goal.length < 4) {
    throw new Error('请描述你的策略想法（至少几个字）')
  }

  const cfg = getConfig()
  if (!cfg.llm.apiKey) {
    throw new Error('API Key 未配置，请在「AI 设置」中填写后重试')
  }

  const client = new LLMClient({
    baseUrl: cfg.llm.baseUrl,
    apiKey: cfg.llm.apiKey,
    model: cfg.llm.model,
  })

  const raw = (await client.completeJson(
    getStrategySystemPrompt(),
    getStrategyUserPrompt(goal, req.symbols, req.period || 'day')
  )) as { title?: string; config?: any }

  if (!raw || typeof raw !== 'object' || !raw.config) {
    throw new Error('模型未返回有效的策略配置')
  }

  const config = sanitizeConfig(raw.config)
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 20) : '未命名策略'

  return { title, config }
}

const PERIODS: StrategyRuleConfig['period'][] = ['day', 'week', '60m', '15m', '5m']

function sanitizeConfig(input: any): StrategyRuleConfig {
  const period = PERIODS.includes(input?.period) ? input.period : 'day'
  return {
    symbols: Array.isArray(input?.symbols)
      ? input.symbols.filter((s: any) => typeof s === 'string').map((s: string) => s.trim()).filter(Boolean)
      : [],
    period,
    entry: sanitizeGroup(input?.entry, 'and'),
    exit: sanitizeGroup(input?.exit, 'or'),
    risk: {
      stopLossPct: numOr(input?.risk?.stopLossPct, 8),
      takeProfitPct: numOr(input?.risk?.takeProfitPct, 20),
      maxHoldDays: input?.risk?.maxHoldDays != null ? numOr(input.risk.maxHoldDays, 0) : undefined,
      positionPct: numOr(input?.risk?.positionPct, 30),
    },
    description: typeof input?.description === 'string' ? input.description : '（模型未生成说明）',
  }
}

function sanitizeGroup(input: any, fallbackLogic: 'and' | 'or') {
  const logic = input?.logic === 'or' ? 'or' : fallbackLogic
  const conditions = Array.isArray(input?.conditions)
    ? input.conditions.map(sanitizeCondition).filter(Boolean as unknown as (c: StrategyCondition | null) => c is StrategyCondition)
    : []
  return { logic, conditions }
}

const CONDITION_TYPES: StrategyCondition['type'][] = [
  'ma_cross',
  'price_cross_ma',
  'price_breakout',
  'rsi',
  'volume_surge',
  'volume_shrink',
  'macd_cross',
  'kdj_cross',
  'boll',
  'change_pct',
  'consecutive',
  'ma_alignment',
]

function sanitizeCondition(input: any): StrategyCondition | null {
  if (!input || !CONDITION_TYPES.includes(input.type)) return null
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : '条件'
  const base: StrategyCondition = {
    type: input.type,
    direction: input.direction,
    label,
  }
  if (input.type === 'ma_cross') {
    base.fast = numOr(input.fast, 5)
    base.slow = numOr(input.slow, 20)
  } else if (input.type === 'price_cross_ma') {
    base.maPeriod = numOr(input.maPeriod, 20)
  } else if (input.type === 'price_breakout') {
    base.lookback = numOr(input.lookback, 20)
  } else if (input.type === 'rsi') {
    base.threshold = numOr(input.threshold, 30)
  } else if (input.type === 'volume_surge') {
    base.threshold = numOr(input.threshold, 2)
  } else if (input.type === 'volume_shrink') {
    base.threshold = numOr(input.threshold, 0.5)
  } else if (input.type === 'macd_cross') {
    base.fast = numOr(input.fast, 12)
    base.slow = numOr(input.slow, 26)
    base.signalPeriod = numOr(input.signalPeriod, 9)
  } else if (input.type === 'boll') {
    base.bollPeriod = numOr(input.bollPeriod, 20)
    base.mult = numOr(input.mult, 2)
  } else if (input.type === 'change_pct') {
    base.threshold = numOr(input.threshold, 3)
  } else if (input.type === 'consecutive') {
    base.days = numOr(input.days, 3)
  } else if (input.type === 'ma_alignment') {
    base.fast = numOr(input.fast, 5)
    base.slow = numOr(input.slow, 20)
  }
  // kdj_cross 无额外参数
  return base
}

function numOr(v: any, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
