/**
 * 桌宠状态推导测试：回合原因 → 提示、提示 → 表情、作用域口径。
 */
import { describe, expect, it } from 'vitest'
import { derivePetState, noticeFromReason, scopeActivity, NOTICE_MS, SLEEP_AFTER_MS } from '../src/client/pet-state.ts'

/** 造一个「什么都不发生」的基准输入。 */
function base(overrides: Partial<Parameters<typeof derivePetState>[0]> = {}) {
  return {
    running: false,
    waiting: false,
    notice: null,
    lastActivityAt: 1_000,
    ...overrides,
  }
}

describe('noticeFromReason', () => {
  it('只有 completed 报喜，error 报错，blocked 转等待', () => {
    expect(noticeFromReason('completed')).toBe('celebrate')
    expect(noticeFromReason('error')).toBe('error')
    expect(noticeFromReason('blocked')).toBe('waiting')
  })

  it('被取消 / 触顶 / 崩溃遗留 / 未知原因一律不提示', () => {
    expect(noticeFromReason('aborted')).toBeNull()
    expect(noticeFromReason('max-tokens')).toBeNull()
    expect(noticeFromReason('interrupted')).toBeNull()
    expect(noticeFromReason('unknown')).toBeNull()
    expect(noticeFromReason('')).toBeNull()
  })
})

describe('derivePetState', () => {
  const now = 10_000

  it('等我处理压过一切', () => {
    expect(derivePetState(base({ waiting: true, running: true }), now)).toBe('waiting')
    expect(derivePetState(base({ waiting: true, notice: { kind: 'error', at: now } }), now)).toBe('waiting')
  })

  it('出错压过庆祝与干活', () => {
    expect(derivePetState(base({ notice: { kind: 'error', at: now } }), now)).toBe('error')
    expect(derivePetState(base({ running: true, notice: { kind: 'error', at: now } }), now)).toBe('error')
  })

  it('庆祝在出错之后、干活之前', () => {
    expect(derivePetState(base({ notice: { kind: 'celebrate', at: now } }), now)).toBe('celebrating')
    expect(derivePetState(base({ running: true, notice: { kind: 'celebrate', at: now } }), now)).toBe('celebrating')
  })

  it('提示过期后不再占着表情', () => {
    const stale = { kind: 'celebrate' as const, at: now - NOTICE_MS - 1 }
    expect(derivePetState(base({ notice: stale }), now)).toBe('resting')
  })

  it('空闲到点进入打盹，有活动则不睡', () => {
    expect(derivePetState(base({ lastActivityAt: now - SLEEP_AFTER_MS }), now)).toBe('sleeping')
    expect(derivePetState(base({ lastActivityAt: now - SLEEP_AFTER_MS + 1 }), now)).toBe('resting')
    expect(derivePetState(base({ running: true, lastActivityAt: now - SLEEP_AFTER_MS }), now)).toBe('working')
  })
})

describe('scopeActivity', () => {
  const statuses = new Map([
    ['a', { running: true, pendingInteraction: undefined }],
    ['b', { running: false, pendingInteraction: { key: 'k' } }],
  ])

  it('全部会话口径：任何会话的状态都算数', () => {
    const activity = scopeActivity(statuses, 'a', 'all')
    expect(activity.running).toBe(true)
    expect(activity.waiting).toBe(true)
  })

  it('当前会话口径：只看选中的那一个', () => {
    expect(scopeActivity(statuses, 'a', 'current')).toEqual({ running: true, waiting: false })
    expect(scopeActivity(statuses, 'b', 'current')).toEqual({ running: false, waiting: true })
    expect(scopeActivity(statuses, 'zzz', 'current')).toEqual({ running: false, waiting: false })
  })
})
