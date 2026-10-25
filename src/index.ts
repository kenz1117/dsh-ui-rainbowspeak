/**
 * 桌宠边界流，宿主半（node face）。
 *
 * 宿主把 `session/event` 里��� `turn/start` / `turn/end` 投影成一条只读事件流，
 * 经 Typert 的 `remote.rainbowPet/watch` 下发给浏览器半。桌宠据此区分
 * 「这一轮真的跑完了」「被取消了」「挂了」——这三者对用户是三种不同的信号，
 * 客户端的会话快照只能看出「现在不在跑了」，分不出来。
 *
 * 设计约束：
 * - **只读**：不持有会话内容、不读历史、不处理审批、不调用模型；
 * - **不追事件**：只转发边界，不重扫 `session.events`；
 * - **可丢弃**：观察者积压时丢弃陈旧边界并补一个基线，而不是补播「成功」；
 * - **幂等**：同一会话的重复序号只认第一次。
 *
 * 边界帧的形状与 Typert 描述符见 `src/remote.ts`；宿主面清单见
 * `src/typert.host.ts`。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak
 */

import { NAMESPACE } from './remote.ts'
import type { BoundaryFrame, BoundaryIdentity, TurnEndKind } from './remote.ts'

/** Cordis 插件名（同时是本插件提供的服务名与远端命名空间）。 */
export const name = NAMESPACE

/**
 * 宿主侧依赖：`agents` 用来判定一个会话是不是子代理。
 *
 * 放在 `inject` 里而非直接取，是为了让缺少该服务的 profile 安静地不装本插件，
 * 而不是抛错——宿主规范明确要求可选服务走 `inject`。
 */
export const inject = ['agents']

/** 单个观察者的积压上限（帧数）。超过即丢弃陈旧边界并补基线。 */
export const QUEUE_LIMIT = 128

/** 基线帧里会话身份清单的上限。 */
const MAX_IDENTITIES = 4096

/** 已见序号的记忆上限（会话数）。 */
const MAX_TRACKED_SESSIONS = 4096

/** 回合结束原因缺省值（宿主事件未带 reason 时的占位）。 */
const UNKNOWN_REASON: TurnEndKind = 'unknown'

/** 观察者接口：中枢把边界帧推进来。 */
interface BoundaryClient {
  /** 收到一帧边界。 */
  push(frame: BoundaryFrame): void
}

/**
 * 判定会话是否为子代理。
 *
 * `agents` 不可用或会话查不到时返回空对象——身份是可选信息，
 * 绝不臆造归属分类。
 * @param agents - 宿主 `agents` 服务（可能缺席）。
 * @param sessionId - 会话身份。
 * @returns 身份标记；无法判定时为空对象。
 */
export function runtimeIdentity(agents: unknown, sessionId: string): BoundaryIdentity {
  try {
    const service = agents as { get?: (id: string) => unknown; roots?: () => readonly unknown[] } | undefined
    if (typeof service?.get !== 'function' || typeof service.roots !== 'function') return { sessionId }
    const agent = service.get(sessionId)
    if (!agent) return { sessionId }
    return { sessionId, isSubagent: !service.roots().includes(agent) }
  } catch {
    return { sessionId }
  }
}

/**
 * 边界流中枢：把宿主事件翻译成边界帧，分发给每个观察者。
 */
export class RainbowBoundaryHub {
  /** 宿主 `agents` 服务（可选）。 */
  private readonly agents: unknown
  /** 宿主进程世代标识：宿主重启后变化，客户端据此丢弃旧流。 */
  private readonly hostEpoch: string
  /** 宿主流序号（单调递增）。 */
  private streamSeq = 0
  /** 单观察者积压上限。 */
  private readonly queueLimit: number
  /** 当前观察者集合。 */
  private readonly clients = new Set<BoundaryClient>()
  /** 每个会话已见到的最大事件序号（去重）。 */
  private readonly seen = new Map<string, number>()
  /** 中枢是否已关闭。 */
  private closed = false

  /**
   * @param options - 组装选项。
   */
  constructor(options: { agents?: unknown; epoch?: string; queueLimit?: number } = {}) {
    this.agents = options.agents
    this.hostEpoch = options.epoch ?? globalThis.crypto.randomUUID()
    this.queueLimit = Math.max(2, Math.min(1024, options.queueLimit ?? QUEUE_LIMIT))
  }

  /**
   * 构造基线帧：新观察者接入时的一次性快照。
   * @returns 基线帧；会话清单不可用时为空清单。
   */
  baseline(): BoundaryFrame {
    let identities: BoundaryIdentity[] = []
    try {
      const service = this.agents as { list?: () => Iterable<{ id?: unknown }> } | undefined
      if (typeof service?.list === 'function') {
        identities = [...service.list()].slice(0, MAX_IDENTITIES).map((agent) => {
          const id = String(agent?.id ?? '')
          return runtimeIdentity(this.agents, id)
        })
      }
    } catch {
      // 身份是可选信息，拿不到就交白卷。
      identities = []
    }
    return { type: 'baseline', hostEpoch: this.hostEpoch, streamSeq: this.streamSeq, identities }
  }

  /**
   * 接收一个宿主会话事件，只有回合边界会被投影。
   * @param session - 事件所属会话。
   * @param event - 会话事件。
   */
  accept(session: unknown, event: unknown): void {
    if (this.closed) return
    if (!event || typeof event !== 'object') return
    const type = (event as { type?: unknown }).type
    if (type !== 'turn/start' && type !== 'turn/end') return
    const sessionId = (session as { id?: unknown } | undefined)?.id
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    const seq = (event as { seq?: unknown }).seq
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return

    // 同一会话的事件序号单调递增；重复投递只认第一次。
    const last = this.seen.get(sessionId)
    if (last !== undefined && seq <= last) return
    this.seen.delete(sessionId)
    this.seen.set(sessionId, seq)
    if (this.seen.size > MAX_TRACKED_SESSIONS) {
      const oldest = this.seen.keys().next()
      if (!oldest.done) this.seen.delete(oldest.value)
    }

    const time = (event as { time?: unknown }).time
    const identity = runtimeIdentity(this.agents, sessionId)
    const shared = {
      hostEpoch: this.hostEpoch,
      streamSeq: ++this.streamSeq,
      sessionId,
      seq,
      time: typeof time === 'number' && Number.isFinite(time) ? time : Date.now(),
      ...(identity.isSubagent === undefined ? {} : { isSubagent: identity.isSubagent }),
    }

    if (type === 'turn/start') {
      this.push({ type: 'turn/start', ...shared })
      return
    }
    this.push({ type: 'turn/end', ...shared, reason: this.reasonOf(event) })
  }

  /**
   * 取出回合结束原因。
   * @param event - 会话事件。
   * @returns 结束原因 kind；缺失时为 `'unknown'`。
   */
  private reasonOf(event: unknown): TurnEndKind {
    const reason = (event as { data?: { reason?: { kind?: unknown } } }).data?.reason?.kind
    return typeof reason === 'string' && reason.length > 0 ? reason.slice(0, 80) : UNKNOWN_REASON
  }

  /**
   * 把一帧分发给全部观察者。
   * @param frame - 边界帧。
   */
  private push(frame: BoundaryFrame): void {
    for (const client of this.clients) client.push(frame)
  }

  /**
   * 订阅边界流。
   *
   * 返回的迭代器在连接时先吐一个基线帧，随后是增量边界；`signal` 中止或
   * 迭代器 `return()` 时立即退订。
   * @param signal - 中止信号。
   * @returns 边界帧的异步迭代器。
   */
  watch(signal?: AbortSignal): AsyncIterable<BoundaryFrame> {
    const hub = this
    const queue: BoundaryFrame[] = []
    let resolveNext: ((result: IteratorResult<BoundaryFrame>) => void) | undefined
    let ended = this.closed || signal?.aborted === true

    const finish = (): void => {
      if (ended) return
      ended = true
      hub.clients.delete(client)
      signal?.removeEventListener('abort', finish)
      queue.length = 0
      if (resolveNext) {
        const resolve = resolveNext
        resolveNext = undefined
        resolve({ done: true, value: undefined })
      }
    }

    const client = {
      push(frame: BoundaryFrame): void {
        if (ended) return
        if (resolveNext) {
          const resolve = resolveNext
          resolveNext = undefined
          resolve({ done: false, value: frame })
          return
        }
        if (queue.length >= hub.queueLimit) {
          // 积压过时丢弃陈旧边界，补一个基线——绝不补播「成功」，
          // 那会把早已结束的一轮说成刚完成。
          queue.length = 0
          queue.push(hub.baseline())
          return
        }
        queue.push(frame)
      },
    }

    if (!ended) {
      this.clients.add(client)
      signal?.addEventListener('abort', finish, { once: true })
      client.push(this.baseline())
    }

    const iterator: AsyncIterableIterator<BoundaryFrame> = {
      next(): Promise<IteratorResult<BoundaryFrame>> {
        if (queue.length > 0) return Promise.resolve({ done: false, value: queue.shift() as BoundaryFrame })
        if (ended) return Promise.resolve({ done: true, value: undefined })
        if (resolveNext) return Promise.reject(new Error('Only one bridge iterator read may be pending'))
        return new Promise((resolve) => { resolveNext = resolve })
      },
      return(): Promise<IteratorResult<BoundaryFrame>> {
        finish()
        return Promise.resolve({ done: true, value: undefined })
      },
      [Symbol.asyncIterator](): AsyncIterableIterator<BoundaryFrame> {
        return iterator
      },
    }
    return iterator
  }

  /** 关闭中枢：退订全部观察者并清空去重记忆。 */
  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const client of [...this.clients]) {
      // 观察者自身的 abort 处理会把它从集合里摘掉；这里只保证集合被清空。
      client.push({ type: 'baseline', hostEpoch: this.hostEpoch, streamSeq: this.streamSeq, identities: [] })
    }
    this.clients.clear()
    this.seen.clear()
  }
}

/**
 * 宿主上下文在本插件用到的最小形状。
 *
 * 声明成结构而非具体 Cordis 类型：宿主 Loader 以动态方式调用 `apply(ctx)`，
 * 这里只需要说清「本插件用到 ctx 的哪几个能力」，不把整个宿主类型拖进来。
 */
export interface RainbowHostContext {
  /** 取一个宿主服务。 */
  get: (key: string) => unknown
  /** 提供一个宿主服务。 */
  provide: (key: string, value: unknown) => void
  /** 订阅一个宿主事件。 */
  on: (event: string, listener: (...args: never[]) => void, options?: { global?: boolean }) => void
  /** 登记一个随插件卸载而释放的副作用。 */
  effect: (fn: () => (() => void) | void, label?: string) => unknown
}

/**
 * 宿主面插件体：提供边界流服务并把宿主事件接进中枢。
 *
 * 服务上挂 `typertRemote` 绑定，是 Typert 认得这条远端的方式；
 * 它把服务、宿主侧键名与远端命名空间绑在一起，浏览器半据此挂载同名命名空间。
 * @param ctx - 宿主根上下文。
 */
export function apply(ctx: RainbowHostContext): void {
  const hub = new RainbowBoundaryHub({ agents: ctx.get('agents') })
  const service = {
    watch(signal?: AbortSignal): AsyncIterable<BoundaryFrame> {
      return hub.watch(signal)
    },
  }
  // Cordis 服务 + 精确的可见协议绑定；严格反射由 ./typert 单独贡献，
  // 这里不做源码发现、也不做装饰器兜底。
  ;(service as unknown as { typertRemote: unknown }).typertRemote = Object.freeze({
    service,
    serviceKey: name,
    namespace: name,
  })
  ctx.provide(name, service)
  ctx.on('session/event', ((session: unknown, event: unknown) => hub.accept(session, event)) as never, { global: true })
  ctx.effect(() => () => hub.dispose(), 'rainbow-pet.boundary-hub')
}
