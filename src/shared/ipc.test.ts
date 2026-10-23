import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'

describe('IPC channel definitions', () => {
  it('should have PING channel defined', () => {
    expect(IPC_CHANNELS.PING).toBe('app:ping')
  })

  it('should have all channel values as strings', () => {
    Object.values(IPC_CHANNELS).forEach((channel) => {
      expect(typeof channel).toBe('string')
      expect(channel.length).toBeGreaterThan(0)
    })
  })
})

// 一个简单的纯函数示例，验证测试框架工作正常
function add(a: number, b: number): number {
  return a + b
}

describe('test framework sanity check', () => {
  it('adds two numbers correctly', () => {
    expect(add(1, 2)).toBe(3)
    expect(add(-1, 1)).toBe(0)
  })
})
