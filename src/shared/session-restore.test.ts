import { describe, it, expect } from 'vitest'
import {
  MAX_RESTORE_TABS_PER_SPACE,
  MAX_RESTORE_WINDOWS,
  buildSession,
  emptySession,
  sanitizeSession,
  tabsForSpace,
  windowsForRestoredTabs,
  type BrowserSession,
  type SessionTab,
  type SessionWindow,
} from './session-restore'

const SPACES = ['watch', 'research']

function tab(id: string, spaceId = 'watch', extra: Partial<SessionTab> = {}): SessionTab {
  return { id, spaceId, url: `https://example.com/${id}`, title: id, isActive: false, poppedOut: false, ...extra }
}

/** 一个独立窗口：内含指定标签，活动标签默认取第一个 */
function win(id: string, tabIds: string[], extra: Partial<SessionWindow> = {}): SessionWindow {
  return {
    id,
    bounds: { x: 1920, y: 100, width: 900, height: 700 },
    displayId: 2,
    tabIds,
    activeTabId: tabIds[0],
    ...extra,
  }
}

describe('sanitizeSession', () => {
  it('空输入返回空会话', () => {
    expect(sanitizeSession(null, { spaceIds: SPACES })).toEqual(emptySession())
    expect(sanitizeSession({}, { spaceIds: SPACES })).toEqual(emptySession())
    expect(sanitizeSession({ tabs: 'x', windows: 3 }, { spaceIds: SPACES })).toEqual(emptySession())
  })

  it('丢弃已删除空间的标签', () => {
    const s = sanitizeSession({ tabs: [tab('a', 'watch'), tab('b', 'gone')], windows: [] }, { spaceIds: SPACES })
    expect(s.tabs.map((t) => t.id)).toEqual(['a'])
  })

  it('丢弃空 url / 重复 id 的标签', () => {
    const s = sanitizeSession(
      { tabs: [tab('a'), { ...tab('a'), title: 'dup' }, { ...tab('c'), url: '  ' }], windows: [] },
      { spaceIds: SPACES }
    )
    expect(s.tabs.map((t) => t.id)).toEqual(['a'])
  })

  it('一个空间只保留一个活动标签', () => {
    const s = sanitizeSession(
      {
        tabs: [tab('a', 'watch', { isActive: true }), tab('b', 'watch', { isActive: true }), tab('c', 'research', { isActive: true })],
        windows: [],
      },
      { spaceIds: SPACES }
    )
    expect(s.tabs.filter((t) => t.isActive).map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('单个空间标签数超上限时截断', () => {
    const many = Array.from({ length: MAX_RESTORE_TABS_PER_SPACE + 5 }, (_, i) => tab(`t${i}`))
    const s = sanitizeSession({ tabs: many, windows: [] }, { spaceIds: SPACES })
    expect(s.tabs.length).toBe(MAX_RESTORE_TABS_PER_SPACE)
    expect(s.tabs[0].id).toBe('t0')
  })

  it('窗口按 id 去重，并丢弃指向不存在标签的 tabId', () => {
    const s = sanitizeSession(
      { tabs: [tab('a'), tab('b')], windows: [win('w1', ['a', 'zzz']), win('w1', ['b'])] },
      { spaceIds: SPACES }
    )
    expect(s.windows.map((w) => w.id)).toEqual(['w1'])
    expect(s.windows[0].tabIds).toEqual(['a'])
  })

  it('窗口内没有任何可恢复标签时不恢复该窗口', () => {
    const s = sanitizeSession({ tabs: [tab('a')], windows: [win('w1', ['ghost'])] }, { spaceIds: SPACES })
    expect(s.windows).toEqual([])
  })

  it('同一标签被写进两个窗口时只归第一个', () => {
    const s = sanitizeSession(
      { tabs: [tab('a'), tab('b')], windows: [win('w1', ['a']), win('w2', ['a', 'b'])] },
      { spaceIds: SPACES }
    )
    expect(s.windows.map((w) => w.id)).toEqual(['w1', 'w2'])
    expect(s.windows[0].tabIds).toEqual(['a'])
    expect(s.windows[1].tabIds).toEqual(['b'])
  })

  it('活动标签不在窗口内时回落到第一个', () => {
    const s = sanitizeSession(
      { tabs: [tab('a'), tab('b')], windows: [win('w1', ['a', 'b'], { activeTabId: 'ghost' })] },
      { spaceIds: SPACES }
    )
    expect(s.windows[0].activeTabId).toBe('a')
  })

  it('窗口 id 重复 / 矩形无效时丢弃', () => {
    const s = sanitizeSession(
      {
        tabs: [tab('a')],
        windows: [
          { ...win('w1', ['a']), id: '' },
          { ...win('w2', ['a']), bounds: { x: 0, y: 0, width: 0, height: 100 } },
          { ...win('w3', ['a']), bounds: { x: Number.NaN, y: 0, width: 10, height: 10 } },
          win('w4', ['a']),
        ],
      },
      { spaceIds: SPACES }
    )
    expect(s.windows.map((w) => w.id)).toEqual(['w4'])
  })

  it('窗口数量超上限时截断', () => {
    const tabs = Array.from({ length: 10 }, (_, i) => tab(`t${i}`))
    const windows = tabs.map((t, i) => win(`w${i}`, [t.id]))
    const s = sanitizeSession({ tabs, windows }, { spaceIds: SPACES })
    expect(s.windows.length).toBe(MAX_RESTORE_WINDOWS)
  })

  it('标签上指向不存在窗口的 windowId 会被清掉', () => {
    const s = sanitizeSession(
      { tabs: [tab('a', 'watch', { windowId: 'ghost' }), tab('b', 'watch', { windowId: 'w1' })], windows: [win('w1', ['b'])] },
      { spaceIds: SPACES }
    )
    expect(s.tabs.find((t) => t.id === 'a')?.windowId).toBeUndefined()
    expect(s.tabs.find((t) => t.id === 'b')?.windowId).toBe('w1')
  })
})

describe('tabsForSpace', () => {
  it('按存档顺序取某空间的标签', () => {
    const tabs = [tab('a', 'watch'), tab('b', 'research'), tab('c', 'watch')]
    expect(tabsForSpace(tabs, 'watch').map((t) => t.id)).toEqual(['a', 'c'])
    expect(tabsForSpace(tabs, 'none').length).toBe(0)
  })
})

describe('windowsForRestoredTabs', () => {
  it('只保留窗口内还有标签会恢复的窗口', () => {
    const windows = [win('w1', ['a']), win('w2', ['b']), win('w3', ['a', 'c'])]
    expect(windowsForRestoredTabs(windows, ['a', 'c']).map((w) => w.id)).toEqual(['w1', 'w3'])
  })
})

describe('buildSession', () => {
  it('窗口只保留被留下的标签', () => {
    const tabs = Array.from({ length: MAX_RESTORE_TABS_PER_SPACE + 3 }, (_, i) => tab(`t${i}`))
    const windows = [win('w1', ['t0', `t${MAX_RESTORE_TABS_PER_SPACE + 2}`])]
    const s: BrowserSession = buildSession(tabs, windows)
    expect(s.windows[0].tabIds).toEqual(['t0'])
  })

  it('没有可恢复标签的窗口被丢掉', () => {
    const s = buildSession([tab('a')], [win('w1', ['ghost'])])
    expect(s.windows).toEqual([])
  })

  it('构造后可直接再 sanitize 而不丢内容', () => {
    const s = buildSession(
      [tab('a', 'watch', { isActive: true }), tab('b', 'research', { windowId: 'w1' })],
      [win('w1', ['b'])]
    )
    const sanitized = sanitizeSession(s, { spaceIds: SPACES })
    expect(sanitized.tabs.length).toBe(2)
    expect(sanitized.windows.length).toBe(1)
    expect(sanitized.tabs[0].isActive).toBe(true)
    expect(sanitized.tabs[1].windowId).toBe('w1')
  })
})
