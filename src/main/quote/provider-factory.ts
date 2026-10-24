import type { QuoteProvider } from './provider'
import { EastmoneyProvider } from './eastmoney-provider'
import { TencentProvider } from './tencent-provider'
import { CustomHttpProvider, type CustomQuoteConfig } from './custom-http-provider'

/**
 * 行情 Provider 工厂：按配置创建数据源实例。
 * 未知 provider 一律回退东财（保底，配置写错也不能让行情全废）。
 */
export function createQuoteProvider(
  provider: string,
  custom?: CustomQuoteConfig
): QuoteProvider {
  switch (provider) {
    case 'tencent':
      return new TencentProvider()
    case 'custom':
      return custom?.quoteUrl?.trim() ? new CustomHttpProvider(custom) : new EastmoneyProvider()
    case 'eastmoney':
    default:
      return new EastmoneyProvider()
  }
}

/** 内置数据源选项（设置页展示用） */
export const QUOTE_SOURCE_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'eastmoney', label: '东方财富', hint: '免费 · 无需 Key · 默认' },
  { id: 'tencent', label: '腾讯财经', hint: '免费 · 无需 Key · 备用源' },
  { id: 'custom', label: '自定义 API', hint: 'TickFlow 等任意 HTTP JSON 接口' },
]
