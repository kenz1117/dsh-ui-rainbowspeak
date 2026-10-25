/**
 * Host↔Client 的回合边界远端契约（Typert）。
 *
 * 桌宠要区分「真的跑完了」和「被取消了」，靠的是宿主侧的权威回合边界事件，
 * 而不是客户端的会话快照推断——客户端快照只能说「现在不在跑了」，
 * 分不清成功、取消与失败。宿主把 `session/event` 的 `turn/start` / `turn/end`
 * 投影成一条只读事件流，经 Typert 的 `remote.rainbowPet/watch` 流式方法下发给
 * 浏览器半。
 *
 * 本模块是两侧共享的唯一事实来源：
 * - 宿主面（`src/typert.host.ts`）据此生成 `TYPERT` 清单，含真实 Zod schema；
 * - 浏览器面（`src/client/index.ts`）据此生成 `TYPERT_REMOTE` 贡献并挂载。
 *
 * 边界帧只携带会话身份与回合边界元数据（turn 号、序号、结束原因），
 * 不携带任何聊天内容、历史或审批细节——契约本身就是这条隐私边界的 enforcement。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/remote
 */

import * as z from 'zod/mini'

/** 本插件的 npm 包名（Typert 以包名归属一份贡献，宿主与浏览器两侧必须一致）。 */
export const PACKAGE_NAME = '@kenz1117/dsh-ui-rainbowspeak'

/** 远端服务命名空间：浏览器据此注入 `remote.rainbowPet`。 */
export const NAMESPACE = 'rainbowPet'

/** 流式方法的类型符号（严格编解码器的身份标识，宿主与浏览器两侧必须一致）。 */
export const FRAME_TYPE_SYMBOL = `${PACKAGE_NAME}#RainbowBoundaryFrame`

/** 回合结束原因（宿主 `TurnEndReason` 的 kind；插件可合并扩展，故按字符串传递）。 */
export type TurnEndKind = string

/** 一个会话在宿主侧的身份标记（是否子代理由宿主判定，客户端只读）。 */
export interface BoundaryIdentity {
  /** 会话身份。 */
  readonly sessionId: string
  /** 是否为子代理会话；宿主无法判定时缺席。 */
  readonly isSubagent?: boolean
}

/** 基线帧：新观察者接入时的一次性快照，之后才是增量边界。 */
export interface BaselineFrame {
  readonly type: 'baseline'
  /** 宿主进程世代标识：宿主重启后变化，客户端据此丢弃旧流。 */
  readonly hostEpoch: string
  /** 宿主侧单调递增的流序号。 */
  readonly streamSeq: number
  /** 宿主当前已知的会话身份清单。 */
  readonly identities: readonly BoundaryIdentity[]
}

/** 回合开始帧。 */
export interface TurnStartFrame {
  readonly type: 'turn/start'
  readonly hostEpoch: string
  readonly streamSeq: number
  /** 会话身份。 */
  readonly sessionId: string
  /** 会话内单调递增的事件序号。 */
  readonly seq: number
  /** 事件时间（Unix 毫秒）。 */
  readonly time: number
  readonly isSubagent?: boolean
}

/** 回合结束帧：携带权威结束原因，客户端据此区分成功 / 取消 / 失败。 */
export interface TurnEndFrame {
  readonly type: 'turn/end'
  readonly hostEpoch: string
  readonly streamSeq: number
  readonly sessionId: string
  readonly seq: number
  readonly time: number
  /** 回合结束原因（`completed` / `aborted` / `error` / …）。 */
  readonly reason: TurnEndKind
  readonly isSubagent?: boolean
}

/** 边界帧联合类型。 */
export type BoundaryFrame = BaselineFrame | TurnStartFrame | TurnEndFrame

/** 单调序号（会话内事件序号与宿主流序号共用上界）。 */
const sequence = z.number().check(z.int(), z.minimum(0), z.maximum(Number.MAX_SAFE_INTEGER))

/** 会话身份（非空字符串，长度有界）。 */
const sessionId = z.string().check(z.minLength(1), z.maxLength(512))

/** 宿主世代标识。 */
const hostEpoch = z.string().check(z.minLength(1), z.maxLength(128))

/** 结束原因（未知 kind 也要能穿过，故只做长度约束）。 */
const reason = z.string().check(z.maxLength(80))

/** 会话身份标记。 */
const identity = z.strictObject({
  sessionId,
  isSubagent: z.optional(z.boolean()),
})

/** 基线与增量帧共有的字段。 */
const shared = {
  hostEpoch,
  streamSeq: sequence,
}

/** 增量边界帧共有的字段。 */
const boundary = {
  ...shared,
  sessionId,
  seq: sequence,
  time: z.number(),
  isSubagent: z.optional(z.boolean()),
}

/**
 * 边界帧的严格 Zod schema（宿主面据此校验下发的每一帧）。
 *
 * `strictObject` 拒绝未知字段：宿主与客户端的契约一旦漂移，错误会在
 * 校验处立刻暴露，而不是静默地多带一个字段穿过浏览器。
 *
 * 用 `zod/mini` 而非完整 `zod`：契约只需要结构与边界校验，mini 产出的
 * 同样是 Zod v4 schema 实例（宿主按 `_zod` 识别），却让浏览器半的包体小一大截。
 */
export const BOUNDARY_FRAME_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('baseline'),
    ...shared,
    identities: z.array(identity).check(z.maxLength(4096)),
  }),
  z.strictObject({ type: z.literal('turn/start'), ...boundary }),
  z.strictObject({ type: z.literal('turn/end'), ...boundary, reason }),
])

/**
 * `watch` 流式方法的描述符。
 *
 * `invocation.kind: 'direct'` 表示方法直接在服务上调用（不经 Context 解析）；
 * `cancellation.parameter: 'signal'` 让客户端的 AbortSignal 能真正断流；
 * 结果走严格编解码器，宿主侧逐帧校验后再下发。
 */
export const WATCH_DESCRIPTOR = {
  id: `${PACKAGE_NAME}#${NAMESPACE}/watch`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'watch',
  mode: 'stream',
  invocation: { kind: 'direct' },
  parameters: [],
  cancellation: { parameter: 'signal' },
  result: {
    mode: 'strict',
    typeSymbol: FRAME_TYPE_SYMBOL,
    create: () => BOUNDARY_FRAME_SCHEMA,
  },
} as const

/** 浏览器面挂载用的远端贡献（`ctx.remote.$mount()` 的入参）。 */
export const TYPERT_REMOTE = {
  package: PACKAGE_NAME,
  descriptors: [WATCH_DESCRIPTOR],
} as const
