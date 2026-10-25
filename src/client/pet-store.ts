/**
 * 桌宠的帧总线：远端接线把边界帧发布到这里，宠物组件订阅。
 *
 * 组件挂在 `shell.overlay`（根作用域），远端接线挂在插件的 `apply` 里，
 * 两者之间没有父子关系——用一条极简的发布/订阅总线解耦，
 * 免得为了传个状态把整棵 React 树串起来。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet-store
 */

import type { BoundaryFrame } from '../remote.ts'

/** 边界帧订阅者。 */
export type FrameListener = (frame: BoundaryFrame) => void

/** 连通状态订阅者。 */
export type HealthListener = (healthy: boolean) => void

const frameListeners = new Set<FrameListener>()
const healthListeners = new Set<HealthListener>()

/** 当前远端是否连通（宿主可达且流已对齐）。 */
let healthy = false

/**
 * 发布一帧边界。
 * @param frame - 边界帧。
 */
export function publishFrame(frame: BoundaryFrame): void {
  for (const listener of [...frameListeners]) {
    try {
      listener(frame)
    } catch {
      // 订阅者的异常不许毒化总线。
    }
  }
}

/**
 * 发布连通状态变化。
 * @param next - 是否连通。
 */
export function publishHealth(next: boolean): void {
  if (healthy === next) return
  healthy = next
  for (const listener of [...healthListeners]) {
    try {
      listener(next)
    } catch {
      // 同上。
    }
  }
}

/**
 * 读取当前连通状态。
 * @returns 是否连通。
 */
export function isHealthy(): boolean {
  return healthy
}

/**
 * 订阅边界帧。
 * @param listener - 订阅者。
 * @returns 退订函数。
 */
export function subscribeFrames(listener: FrameListener): () => void {
  frameListeners.add(listener)
  return () => { frameListeners.delete(listener) }
}

/**
 * 订阅连通状态。
 * @param listener - 订阅者。
 * @returns 退订函数。
 */
export function subscribeHealth(listener: HealthListener): () => void {
  healthListeners.add(listener)
  return () => { healthListeners.delete(listener) }
}
