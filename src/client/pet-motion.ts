/**
 * 桌宠的纯计算：台词池、视线跟随、拖拽摆动。
 *
 * 这些都是「可测的物理」——抽出来是为了让互动手感有单测兜底，
 * 而不是散在组件里靠肉眼调。本模块无 React、无 DOM。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet-motion
 */

import type { RainbowKey } from './locales.ts'
import type { PetState } from './pet-state.ts'

/**
 * 各状态的两句台词（键）。
 *
 * 每次进入状态轮换一句，避免桌宠像复读机；同状态不换行，
 * 这样「出错」这种状态不会显得闪烁。
 */
export const STATE_LINES: Record<PetState, readonly [RainbowKey, RainbowKey]> = {
  resting: ['petResting', 'petResting2'],
  working: ['petWorking', 'petWorking2'],
  waiting: ['petWaiting', 'petWaiting2'],
  celebrating: ['petCelebrate', 'petCelebrate2'],
  error: ['petError', 'petError2'],
  sleeping: ['petSleeping', 'petSleeping2'],
}

/** 被戳时的台词。 */
export const POKE_LINES: readonly RainbowKey[] = ['petPoke1', 'petPoke2', 'petPoke3']

/**
 * 按序号轮换取一个键。
 *
 * 用序号而不是随机数：同一序号永远得到同一句，行为可测、
 * 也不会在重渲染时跳词。
 * @param keys - 候选键。
 * @param seq - 轮换序号。
 * @returns 选中的键。
 */
export function pickKey(keys: readonly RainbowKey[], seq: number): RainbowKey {
  if (keys.length === 0) throw new Error('pet-motion: 台词池为空')
  const index = ((Math.trunc(seq) % keys.length) + keys.length) % keys.length
  return keys[index] as RainbowKey
}

/**
 * 视线跟随：把指针相对宠物的偏移压进一个半径内。
 *
 * 宠物不会真的转头，它只是把瞳孔挪一点点——所以偏移量要有上限，
 * 否则指针甩到很远时眼睛会「跑出眼眶」。
 * @param dx - 指针相对宠物中心的横坐标差。
 * @param dy - 指针相对宠物中心的纵坐标差。
 * @param max - 瞳孔最大偏移（px）。
 * @returns 瞳孔偏移（px）。
 */
export function lookVector(dx: number, dy: number, max: number): { x: number; y: number } {
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { x: 0, y: 0 }
  const scale = Math.min(1, max / distance)
  return { x: dx * scale, y: dy * scale }
}

/**
 * 拖拽摆动角：跟着水平速度倾斜。
 *
 * 抓着宠物甩一下，它会顺着惯性歪一下——纯 CSS 做不到这个反馈，
 * 只能用速度算出角度。
 * @param velocityX - 水平速度（px/ms）。
 * @param maxDeg - 最大倾角。
 * @returns 倾角（度）。
 */
export function swingAngle(velocityX: number, maxDeg: number): number {
  const angle = velocityX * 900
  return Math.min(maxDeg, Math.max(-maxDeg, angle))
}

/**
 * 挤压回弹：一次戳击的形变曲线。
 *
 * `t` 是从 0 到 1 的时间进度，返回 (scaleX, scaleY)：
 * 先压扁、再回弹过头、最后归位。
 * @param t - 时间进度（0→1）。
 * @returns 横向与纵向缩放。
 */
export function squashCurve(t: number): { x: number; y: number } {
  if (t <= 0 || t >= 1) return { x: 1, y: 1 }
  // 0.0-0.25 压扁，0.25-0.6 回弹拉长，0.6-1.0 阻尼收敛。
  if (t < 0.25) {
    const k = t / 0.25
    return { x: 1 + 0.16 * k, y: 1 - 0.18 * k }
  }
  if (t < 0.6) {
    const k = (t - 0.25) / 0.35
    const decay = 1 - k
    return { x: 1 - 0.1 * decay, y: 1 + 0.12 * decay }
  }
  const k = (t - 0.6) / 0.4
  const decay = 1 - k
  return { x: 1 + 0.04 * decay, y: 1 - 0.05 * decay }
}
