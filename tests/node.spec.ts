/**
 * node 半测试：边界中枢的投影语义（只投影回合边界、去重、基线、断流、畸形事件丢弃）。
 */
import { describe, expect, it } from 'vitest'
import { apply, RainbowBoundaryHub, type RainbowHostContext } from '../src/index.ts'

/** 造一个最小的宿主 ctx（记录 provide/on/effect 的调用）。 */
function fakeCtx() {
  const listeners: Array<(session: unknown, event: unknown) => void> = []
  const provided = new Map<string, unknown>()
  const disposers: Array<() => void> = []
  return {
    listeners,
    provided,
    disposers,
    get: () => undefined,
    provide: (key: string, value: unknown) => { provided.set(key, value) },
    on: (_event: string, listener: (session: unknown, event: unknown) => void) => { listeners.push(listener) },
    effect: (fn: () => (() => void) | void) => {
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
  }
}

/** 造一个会话事件。 */
function event(type: string, seq: number, data?: unknown) {
  return { type, seq, time: 1_700_000_000_000, data }
}

/** 订阅边界流并收集前若干帧。 */
function collect(hub: RainbowBoundaryHub, count: number): { frames: unknown[]; done: Promise<void> } {
  const frames: unknown[] = []
  const stream = hub.watch()
  const done = (async () => {
    for await (const frame of stream) {
      frames.push(frame)
      if (frames.length >= count) break
    }
  })()
  return { frames, done }
}

describe('RainbowBoundaryHub', () => {
  it('只投影 turn/start 与 turn/end，其它事件一律忽略', async () => {
    const hub = new RainbowBoundaryHub()
    const { frames, done } = collect(hub, 3)
    hub.accept({ id: 's1' }, event('assistant/message', 1))
    hub.accept({ id: 's1' }, event('turn/start', 2))
    hub.accept({ id: 's1' }, event('turn/end', 3, { reason: { kind: 'completed' } }))
    await done
    expect(frames).toHaveLength(3)
    expect(frames[0]).toMatchObject({ type: 'baseline' })
    expect(frames[1]).toMatchObject({ type: 'turn/start', sessionId: 's1', seq: 2 })
    expect(frames[2]).toMatchObject({ type: 'turn/end', sessionId: 's1', reason: 'completed' })
  })

  it('同一会话的重复序号只认第一次', async () => {
    const hub = new RainbowBoundaryHub()
    const { frames, done } = collect(hub, 2)
    hub.accept({ id: 's1' }, event('turn/start', 5))
    hub.accept({ id: 's1' }, event('turn/start', 5))
    hub.accept({ id: 's1' }, event('turn/start', 4))
    await done
    expect(frames[1]).toMatchObject({ type: 'turn/start', seq: 5 })
  })

  it('结束原因缺失时记为 unknown，不臆造分类', async () => {
    const hub = new RainbowBoundaryHub()
    const { frames, done } = collect(hub, 2)
    hub.accept({ id: 's1' }, event('turn/end', 1))
    await done
    expect(frames[1]).toMatchObject({ type: 'turn/end', reason: 'unknown' })
  })

  it('abort 后流结束，不再投递新帧', async () => {
    const hub = new RainbowBoundaryHub()
    const abort = new AbortController()
    const frames: unknown[] = []
    const stream = hub.watch(abort.signal)
    const done = (async () => {
      for await (const frame of stream) frames.push(frame)
    })()
    // 先让读者取走基线。
    await Promise.resolve()
    const before = frames.length
    abort.abort()
    hub.accept({ id: 's1' }, event('turn/start', 1))
    await done
    // 中止之后再来的边界一律不投递。
    expect(frames.length).toBe(before)
    expect(frames[0]).toMatchObject({ type: 'baseline' })
  })

  it('会话身份缺失或畸形的事件被丢弃', async () => {
    const hub = new RainbowBoundaryHub()
    const { frames, done } = collect(hub, 1)
    hub.accept(undefined, event('turn/start', 1))
    hub.accept({ id: '' }, event('turn/start', 2))
    hub.accept({ id: 's1' }, { type: 'turn/start', seq: 'x' })
    await done
    // 只有基线：畸形事件一概不进流。
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ type: 'baseline' })
  })

  it('每个观察者都拿到同一份边界', async () => {
    const hub = new RainbowBoundaryHub()
    const a = collect(hub, 2)
    const b = collect(hub, 2)
    hub.accept({ id: 's1' }, event('turn/start', 1))
    await Promise.all([a.done, b.done])
    expect(a.frames[1]).toMatchObject({ type: 'turn/start' })
    expect(b.frames[1]).toMatchObject({ type: 'turn/start' })
    // 同一帧分发给所有观察者：序号相同，不会各编各的。
    const seqA = (a.frames[1] as { streamSeq: number }).streamSeq
    const seqB = (b.frames[1] as { streamSeq: number }).streamSeq
    expect(seqB).toBe(seqA)
  })
})

describe('node half apply', () => {
  it('提供边界服务、挂上 typertRemote 绑定并订阅宿主事件', () => {
    const ctx = fakeCtx()
    apply(ctx as unknown as RainbowHostContext)
    const service = ctx.provided.get('rainbowPet') as { watch?: unknown; typertRemote?: unknown }
    expect(typeof service.watch).toBe('function')
    const binding = service.typertRemote as { serviceKey: string; namespace: string }
    expect(binding.serviceKey).toBe('rainbowPet')
    expect(binding.namespace).toBe('rainbowPet')
    expect(ctx.listeners).toHaveLength(1)
  })
})
