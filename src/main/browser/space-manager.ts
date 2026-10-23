import type { Space, SpaceId } from '@shared/ipc'
import type { Database } from 'sql.js'
import { getSpaces } from '../db/settings'

export type { SpaceId }

/**
 * 空间：id 创建后不可变（session partition 按它拼接，改名不丢登录态）；
 * 列表持久化在 settings 表，支持自定义增删改名。
 */
export function loadSpaces(db: Database): Space[] {
  return getSpaces(db)
}

/**
 * 获取空间对应的 session partition 名称
 * 每个空间使用独立的 persist 分区，实现登录态隔离
 */
export function getSpacePartition(spaceId: SpaceId): string {
  return `persist:space-${spaceId}`
}
