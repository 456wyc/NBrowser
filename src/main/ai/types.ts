/**
 * AI 分析输出结构（固定字段，来自 PRD F4）
 *
 * 类型定义统一放在 @shared/ipc，保证主进程与渲染进程共用同一份契约。
 * 这里做 re-export，避免破坏既有的 `from '../ai/types'` 引用。
 */
export type {
  AiAnalysisResult,
  BullishBearishItem,
  KeyDataItem,
  PageType,
  AnalysisMode,
  AiAnalysisView,
  AiHistoryItem,
} from '@shared/ipc'
