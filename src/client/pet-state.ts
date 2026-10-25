/**
 * 桌宠状态推导：把「权威回合边界」与「客户端会话状态」折叠成一个表情状态。
 *
 * 两路输入各管一件事：
 * - **回合边界流**（宿主侧 Typert 远端）说清一轮的**结局**：真跑完了、被取消、
 *   还是挂了。客户端快照说不出这个区别，所以成功与失败必须以边界流为准；
 * - **会话状态**（`useSessionStatus` / `useSessions` 标准席位）说清**当下**：
 *   哪些会话在跑、哪些卡在等我点确认。
 *
 * 优先级（高 → 低）：等待我 > 出错 > 庆祝 > 干活 > 打盹 > 待机。
 * 「等待我」压过一切——那是唯一一种「不处理就会卡住」的状态。
 *
 * 本模块是纯函数，无 React、无 DOM，便于单测。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet-state
 */

/** 桌宠表情状态。 */
export type PetState = 'resting' | 'working' | 'waiting' | 'celebrating' | 'error' | 'sleeping'

/** 一次性提示的种类。 */
export type PetNoticeKind = 'celebrate' | 'error' | 'waiting'

/** 一次性提示（带发生时刻，用于判断是否过期）。 */
export interface PetNotice {
  /** 提示种类。 */
  readonly kind: PetNoticeKind
  /** 发生时刻（Unix 毫秒）。 */
  readonly at: number
}

/** 一次性提示的展示时长（毫秒）。 */
export const NOTICE_MS = 3200

/** 进入打盹所需的空闲时长（毫秒）。 */
export const SLEEP_AFTER_MS = 120_000

/**
 * 把宿主回合结束原因映射成一次性提示。
 *
 * 只认三种有意义的结局：
 * - `completed` → 庆祝（真跑完了）；
 * - `error` → 出错（挂了）；
 * - `blocked` → 等待（这一轮卡在等我）。
 *
 * 其余（`aborted` 被取消、`max-tokens` 触顶、`interrupted` 崩溃遗留、
 * 未知 kind）一律**不提示**——被取消的一轮不算「完成」，报喜是撒谎。
 * @param reason - 宿主回合结束原因 kind。
 * @returns 提示种类；无提示时为 `null`。
 */
export function noticeFromReason(reason: string): PetNoticeKind | null {
  switch (reason) {
    case 'completed':
      return 'celebrate'
    case 'error':
      return 'error'
    case 'blocked':
      return 'waiting'
    default:
      return null
  }
}

/**
 * 状态推导的输入。
 */
export interface PetStateInput {
  /** 有会话正在运行。 */
  readonly running: boolean
  /** 有会话在等用户交互（审批 / 提问）。 */
  readonly waiting: boolean
  /** 当前一次性提示；无则 `null`。 */
  readonly notice: PetNotice | null
  /** 最近一次活动的时刻（Unix 毫秒）。 */
  readonly lastActivityAt: number
}

/**
 * 折叠出桌宠表情状态。
 * @param input - 状态输入。
 * @param now - 当前时刻（Unix 毫秒）。
 * @returns 表情状态。
 */
export function derivePetState(input: PetStateInput, now: number): PetState {
  const { running, waiting, notice, lastActivityAt } = input
  // 等我处理是唯一会卡住整个流程的状态，压过一切。
  if (waiting) return 'waiting'
  const noticeFresh = notice !== null && now - notice.at < NOTICE_MS
  if (noticeFresh && notice.kind === 'error') return 'error'
  if (noticeFresh && notice.kind === 'celebrate') return 'celebrating'
  if (noticeFresh && notice.kind === 'waiting') return 'waiting'
  if (running) return 'working'
  if (!running && now - lastActivityAt >= SLEEP_AFTER_MS) return 'sleeping'
  return 'resting'
}

/**
 * 会话作用域：全部会话，还是只看当前会话。
 */
export type PetScope = 'all' | 'current'

/**
 * 当前会话身份变更事件名。
 *
 * 当前选中会话由会话作用域的状态桥发布（根作用域的覆盖层拿不到选择本身），
 * 桌宠订阅这条事件才知道「当前会话」是谁。
 */
export const SESSION_EVENT = 'dsh-ui-rainbowspeak:session'

/**
 * 读取当前会话身份（状态桥发布在 `<html>` 上的标记）。
 * @returns 当前会话身份；没有当前会话时为 `undefined`。
 */
export function readCurrentSessionId(): string | undefined {
  return document.documentElement.dataset.rainbowSession
}

/**
 * 会话状态表里的一条状态（宿主投影的最小形状）。
 *
 * `running` 是「最新已知」——基线或事件建立之前为 `undefined`，
 * 因此类型上就是 `boolean | undefined`，不是可选属性。
 */
export interface PetSessionStatus {
  /** 是否在运行；尚未建立时为 `undefined`。 */
  readonly running: boolean | undefined
  /** 当前等待用户交互的请求；无则 `undefined`。 */
  readonly pendingInteraction: unknown
}

/**
 * 从会话状态表里数出符合作用域的「在跑」与「等我」会话。
 *
 * `all` 口径下任何会话的状态都算数；`current` 口径只认当前选中的会话
 * （当前会话身份由会话作用域的状态桥发布，根作用域的覆盖层拿不到选择本身）。
 *
 * 拿不到当前会话时（没开对话视图，或视图还没挂上）**回落成全部会话**——
 * 「只看当前会话」不该变成「什么都不看」。
 * @param statuses - 会话状态表（会话身份 → 状态）。
 * @param currentId - 当前会话身份；`all` 口径下不用。
 * @param scope - 作用域。
 * @returns 是否在跑、是否在等我。
 */
export function scopeActivity(
  statuses: ReadonlyMap<string, PetSessionStatus>,
  currentId: string | undefined,
  scope: PetScope,
): { readonly running: boolean; readonly waiting: boolean } {
  const effective: PetScope = scope === 'current' && currentId === undefined ? 'all' : scope
  let running = false
  let waiting = false
  for (const [id, status] of statuses) {
    if (effective === 'current' && id !== currentId) continue
    if (status.running === true) running = true
    if (status.pendingInteraction !== undefined) waiting = true
    if (running && waiting) break
  }
  return { running, waiting }
}
