/**
 * 会话运行状态桥：把当前会话的运行/出错/审批等待状态投影为 `<html>` 的
 * `data-rainbow-state` 标记，并在回合完成的瞬间打一次
 * `data-rainbow-celebrate`（0.9s 后由本桥自行移除），供注入样式表切换
 * 流动速度与配色。
 *
 * 挂在 `conversation.composer.dock`（session 作用域）以拿到 useSession 与
 * useSessionPendingInteraction 标准席位；组件自身渲染 null——它是纯状态桥，
 * 不占版面。
 * 状态优先级：出错 > 审批等待 > 运行中 > 空闲（对用户的关键程度递减）。
 * @module @kenz1117/dsh-ui-rainbowspeak/client/state-bridge
 */

import { useEffect, useRef } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SESSION_EVENT } from './pet-state.ts'

/** 桥接后的状态名（与样式表选择器对应）。 */
export type RainbowState = 'idle' | 'running' | 'attention' | 'error'

/** 完成庆祝标记的展示时长（与样式表 keyframes 时长一致）。 */
export const CELEBRATE_MS = 900

/**
 * 从会话快照投影彩虹状态。
 * @param snapshot - 当前会话快照（running/promptError/lastAgentError 参与判定）。
 * @returns 状态名：出错 > 运行中 > 空闲。
 */
export function rainbowStateOf(snapshot: {
  running: boolean
  promptError: unknown
  lastAgentError: string | null
}): Exclude<RainbowState, 'attention'> {
  if (snapshot.promptError || snapshot.lastAgentError) return 'error'
  if (snapshot.running) return 'running'
  return 'idle'
}

/**
 * 合成最终状态：出错优先，其次审批等待，再次运行中。
 * @param attention - 是否有等待用户的 pending interaction。
 * @param sessionState - 会话运行状态（不含 attention）。
 * @returns 下发到 `<html data-rainbow-state>` 的最终状态。
 */
export function effectiveState(attention: boolean, sessionState: Exclude<RainbowState, 'attention'>): RainbowState {
  if (sessionState === 'error') return 'error'
  if (attention) return 'attention'
  return sessionState
}

/**
 * 状态桥组件：会话/审批状态变化时同步 `<html data-rainbow-state>`，
 * 回合完成瞬间打 `data-rainbow-celebrate`，卸载时清除全部标记与定时器。
 * @param props - dock 槽位的全局与会话标准席位。
 * @returns null（纯状态桥，无视觉输出）。
 */
export function RainbowStateBridge(props: PropsRuntime<'conversation.composer.dock'>): null {
  const sessionState = props.useSession(rainbowStateOf)
  // 等待用户交互来自宿主投影的会话状态表（会话作用域下按当前会话取一条）。
  const attention = props.useSessionStatus((map) => map.get(props.sessionId)?.pendingInteraction !== undefined)
  const prevRunningRef = useRef<boolean | null>(null)
  const celebrateTimerRef = useRef<number | null>(null)

  // 发布当前会话身份：桌宠住在根作用域的覆盖层里，拿不到「当前选中会话」本身，
  // 只能由会话作用域的这道桥把身份递过去。
  useEffect(() => {
    const root = document.documentElement
    root.dataset.rainbowSession = props.sessionId
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: props.sessionId }))
    return () => {
      delete root.dataset.rainbowSession
      window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: undefined }))
    }
  }, [props.sessionId])

  // 状态合成与下发：error > attention > running > idle。
  useEffect(() => {
    const state = effectiveState(attention, sessionState)
    if (state === 'idle') delete document.documentElement.dataset.rainbowState
    else document.documentElement.dataset.rainbowState = state
  }, [sessionState, attention])

  // 回合完成检测：上一拍 running、这一拍 idle（无错误）时打庆祝标记。
  useEffect(() => {
    const wasRunning = prevRunningRef.current
    prevRunningRef.current = sessionState === 'running'
    if (wasRunning !== true || sessionState !== 'idle') return
    document.documentElement.dataset.rainbowCelebrate = '1'
    if (celebrateTimerRef.current !== null) window.clearTimeout(celebrateTimerRef.current)
    celebrateTimerRef.current = window.setTimeout(() => {
      delete document.documentElement.dataset.rainbowCelebrate
      celebrateTimerRef.current = null
    }, CELEBRATE_MS)
  }, [sessionState])

  // 卸载清理：标记、定时器一并移除，宿主不留残留属性。
  useEffect(() => () => {
    if (celebrateTimerRef.current !== null) window.clearTimeout(celebrateTimerRef.current)
    delete document.documentElement.dataset.rainbowState
    delete document.documentElement.dataset.rainbowCelebrate
  }, [])
  return null
}
