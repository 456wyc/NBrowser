import { describe, it, expect } from 'vitest'
import { bucketTs } from './runner'

describe('bucketTs（运行态 K 线周期对齐）', () => {
  it('日线：同一天内的不同时刻对齐到同一根（当日 0 点）', () => {
    const morning = new Date('2026-05-20T09:35:00').getTime()
    const afternoon = new Date('2026-05-20T14:50:00').getTime()
    expect(bucketTs(morning, 'day')).toBe(bucketTs(afternoon, 'day'))
    expect(new Date(bucketTs(morning, 'day')).getHours()).toBe(0)
  })

  it('日线：不同日期对齐到不同根', () => {
    const d1 = new Date('2026-05-20T10:00:00').getTime()
    const d2 = new Date('2026-05-21T10:00:00').getTime()
    expect(bucketTs(d1, 'day')).not.toBe(bucketTs(d2, 'day'))
  })

  it('5 分钟线：同一 5 分钟窗口内对齐到同一根', () => {
    const a = new Date('2026-05-20T10:01:00').getTime()
    const b = new Date('2026-05-20T10:04:59').getTime()
    const c = new Date('2026-05-20T10:05:00').getTime()
    expect(bucketTs(a, '5m')).toBe(bucketTs(b, '5m'))
    expect(bucketTs(a, '5m')).not.toBe(bucketTs(c, '5m'))
  })

  it('未指定周期按日线处理', () => {
    const t = new Date('2026-05-20T13:00:00').getTime()
    expect(bucketTs(t, undefined as any)).toBe(bucketTs(t, 'day'))
  })
})
