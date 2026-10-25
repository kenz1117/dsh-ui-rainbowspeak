/**
 * 桌宠的远端接线：挂载 Typert 贡献、消费宿主回合边界流。
 *
 * 浏览器半通过 `ctx.remote.$mount()` 把本包的远端贡献挂进远端运行时，
 * 贡献生效后 `remote.rainbowPet` 命名空间才出现——命名空间是独立的 Cordis
 * 能力，得在挂载**之后**再注入，否则会挂死在等待里。
 *
 * 消费循环做三件要紧的事：
 * - **逐帧校验**：用与宿主同源的 Zod schema 解析每一帧，契约漂移当场暴露；
 * - **水位线校验**：帧序号必须连续，断号说明流坏了——宁可重连也不拿半截状态
 *   去骗用户；
 * - **失败即退**：流结束或出错就走退避重连，绝不把陈旧边界当成新边界。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet-remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { BOUNDARY_FRAME_SCHEMA, TYPERT_REMOTE, type BoundaryFrame } from '../remote.ts'
import { publishFrame, publishHealth } from './pet-store.ts'

/** 远端命名空间的最小结构（`remote.rainbowPet.watch`）。 */
interface PetRemoteNamespace {
  /** 订阅边界流；返回的句柄可迭代，AbortSignal 中止即断流。 */
  watch(signal: AbortSignal): AsyncIterable<unknown> & { dispose?: () => Promise<void> | void }
}

/** `ctx` 上用到的远端能力（结构化声明，不与网关包的类型版本耦合）。 */
interface RemoteCapableContext {
  remote: {
    /** 挂载一份宿主→客户端贡献；resolve 后得到卸载函数。 */
    $mount(contribution: unknown): Promise<() => Promise<void> | void>
  }
  inject: (keys: string[], callback: (scope: unknown) => void) => { dispose: () => Promise<void> | void }
}

/** 挂载租约：同一宿主根上只挂一次远端贡献。 */
const mountLeases = new WeakMap<object, { readonly ready: Promise<() => Promise<void> | void>; refs: number }>()

/**
 * 取（或建立）当前宿主根上的远端挂载租约。
 *
 * Cordis 每次 `get` 都返回一个新的包装服务，多个挂载点各自 `$mount` 会造成
 * 重复端点。这里按宿主根复用一份租约，引用计数归零时才真正卸载。
 * @param ctx - 客户端根上下文。
 * @returns 租约的 ready 承诺与引用计数句柄。
 */
function acquireMountLease(ctx: Context, remote: RemoteCapableContext['remote']): { ready: Promise<() => Promise<void> | void>; release: () => void } {
  const owner = (ctx as unknown as { root?: object }).root ?? (ctx as unknown as object)
  let lease = mountLeases.get(owner)
  if (lease === undefined) {
    const ready = Promise.resolve(remote.$mount(TYPERT_REMOTE))
    lease = { ready, refs: 0 }
    mountLeases.set(owner, lease)
    // 挂载失败不缓存租约：下次挂载应当重新尝试。
    ready.catch(() => { if (mountLeases.get(owner) === lease) mountLeases.delete(owner) })
  }
  lease.refs += 1
  const current = lease
  let released = false
  return {
    ready: current.ready,
    release(): void {
      if (released) return
      released = true
      current.refs -= 1
      if (current.refs > 0) return
      mountLeases.delete(owner)
      current.ready.then((unmount) => { void unmount() }).catch(() => { /* 已失效 */ })
    },
  }
}

/**
 * 启动桌宠的远端接线。
 *
 * 传入的 ctx 必须是**声明过 `remote`** 的子上下文（Cordis 只允许在 inject 里
 * 取服务）。远端运行时缺席时该子上下文不会激活，桌宠安静降级。
 * @param ctx - 声明了 `remote` 的客户端子上下文。
 * @returns 停止句柄（幂等）。
 */
export function startPetRemote(ctx: Context): { dispose: () => void } {
  const abort = new AbortController()
  let stopped = false
  let timer: number | undefined
  let fiber: { dispose: () => Promise<void> | void } | undefined
  let retryDelay = 1000

  const remote = (ctx as unknown as RemoteCapableContext).remote
  if (remote === undefined) {
    publishHealth(false)
    return { dispose: () => { stopped = true } }
  }

  const lease = acquireMountLease(ctx, remote)

  /** 消费一轮边界流；结束后按退避重连。 */
  const consume = async (scope: { remote: Record<string, PetRemoteNamespace | undefined> }): Promise<void> => {
    const namespace = scope.remote.rainbowPet
    if (namespace === undefined) throw new Error('Rainbow pet bridge: namespace unavailable')
    const handle = namespace.watch(abort.signal)
    try {
      let epoch: string | undefined
      let watermark = 0
      for await (const value of handle) {
        if (stopped) return
        const frame = BOUNDARY_FRAME_SCHEMA.parse(value) as BoundaryFrame
        if (frame.type === 'baseline') {
          epoch = frame.hostEpoch
          watermark = frame.streamSeq
          publishHealth(true)
          retryDelay = 1000
          continue
        }
        // 基线之前没有帧可对齐；基线之后帧序号必须连续。
        if (epoch === undefined || frame.hostEpoch !== epoch) throw new Error('Rainbow pet bridge: baseline required')
        if (frame.streamSeq <= watermark) continue
        if (frame.streamSeq !== watermark + 1) throw new Error('Rainbow pet bridge: sequence gap')
        watermark = frame.streamSeq
        publishFrame(frame)
      }
    } catch {
      // 失败即退：断流、解析失败、序号断层都走重连，绝不拿半截状态糊弄用户。
    } finally {
      publishHealth(false)
      if (!stopped) {
        timer = window.setTimeout(() => { timer = undefined; void consume(scope) }, retryDelay)
        retryDelay = Math.min(10_000, retryDelay * 2)
      }
    }
  }

  const start = async (): Promise<void> => {
    try {
      await lease.ready
      if (stopped) return
      fiber = (ctx as unknown as RemoteCapableContext).inject(['remote.rainbowPet'], (scope) => {
        if (stopped) return
        void consume(scope as { remote: Record<string, PetRemoteNamespace | undefined> })
      })
    } catch {
      publishHealth(false)
    }
  }
  void start()
  return {
    dispose(): void {
      if (stopped) return
      stopped = true
      abort.abort()
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      void fiber?.dispose()
      lease.release()
      publishHealth(false)
    },
  }
}
