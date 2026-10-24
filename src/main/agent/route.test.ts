import { describe, it, expect } from 'vitest'
import { parseRouteDecision, buildRouterInput } from './route'

describe('parseRouteDecision', () => {
  it('明确 chat 走轻量直答', () => {
    expect(parseRouteDecision('chat')).toBe('chat')
    expect(parseRouteDecision('CHAT')).toBe('chat')
    expect(parseRouteDecision(' chat.')).toBe('chat')
    expect(parseRouteDecision('chat\n')).toBe('chat')
  })

  it('明确 tools 走完整链路', () => {
    expect(parseRouteDecision('tools')).toBe('tools')
    expect(parseRouteDecision('TOOLS')).toBe('tools')
  })

  it('JSON 包裹也能解析', () => {
    expect(parseRouteDecision('{"route":"chat"}')).toBe('chat')
    expect(parseRouteDecision('{"decision": "tools"}')).toBe('tools')
  })

  it('空串/乱码/不确定一律按 tools（绝不降级丢能力）', () => {
    expect(parseRouteDecision('')).toBe('tools')
    expect(parseRouteDecision('。。。')).toBe('tools')
    expect(parseRouteDecision('可能是chat吧')).toBe('tools')
    expect(parseRouteDecision('chatty')).toBe('tools') // 非精确匹配不放过
  })

  it('带解释的长回复也按 tools（保守）', () => {
    expect(parseRouteDecision('用户问的是市盈率概念，属于 chat')).toBe('tools')
  })
})

describe('buildRouterInput', () => {
  it('只有用户消息时不含助手行', () => {
    expect(buildRouterInput('你好')).toBe('用户：你好')
  })

  it('有上文时附带截断的助手回复', () => {
    const long = '回'.repeat(500)
    const out = buildRouterInput('那茅台呢', long)
    expect(out).toContain('用户：那茅台呢')
    expect(out).toContain('助手（上一轮，已截断）：')
    // 截断到 200 字
    expect(out.length).toBeLessThan(300)
  })

  it('助手回复为空白时忽略', () => {
    expect(buildRouterInput('你好', '   ')).toBe('用户：你好')
  })
})
