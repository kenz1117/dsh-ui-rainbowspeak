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

/** 被戳时的台词（池子越大越耐戳；顺序轮换保证短期内不复读）。 */
export const POKE_LINES: readonly RainbowKey[] = ['petPoke1', 'petPoke2', 'petPoke3', 'petPoke4', 'petPoke5']

/** 连戳转圈的台词（转圈 + 晕）。 */
export const SPIN_LINES: readonly RainbowKey[] = ['petSpin1', 'petSpin2']

/** 长按摸摸的台词。 */
export const PAT_LINES: readonly RainbowKey[] = ['petPat1', 'petPat2']

/** 打盹中被戳（惊醒）的台词。 */
export const STARTLE_LINES: readonly RainbowKey[] = ['petStartle1', 'petStartle2']

/** 闲时哼小曲的台词。 */
export const HUM_LINES: readonly RainbowKey[] = ['petHum1', 'petHum2']

/** 闲多久之后才会哼小曲（ms）：比打盹短，比普通待机情绪更「闲」。 */
export const HUM_AFTER_MS = 45_000

/**
 * 哼完一支小曲后的冷却（ms）：36s–60s 随机——哼歌是情致，不是报时。
 * @param random - 随机源（默认 `Math.random`）。
 * @returns 冷却时长（ms）。
 */
export function humDelay(random: () => number = Math.random): number {
  return 36_000 + random() * 24_000
}

/** 连戳判定窗口（ms）：两次戳击间隔小于它就算「连戳」，触发转圈。 */
export const POKE_WINDOW_MS = 320

/** 长按判定时长（ms）：按住不动超过它就算「摸摸」而不是戳。 */
export const LONG_PRESS_MS = 650

/**
 * 是否连戳：两次戳击落在判定窗口内。
 *
 * 双击是用户明确的重互动信号，值得一个比戳更大的反应（转圈）。
 * @param prevAt - 上一次戳击时刻；从未戳过为 `null`。
 * @param now - 本次戳击时刻。
 * @param windowMs - 判定窗口（ms）。
 * @returns 是否连戳。
 */
export function isRapidPoke(prevAt: number | null, now: number, windowMs: number = POKE_WINDOW_MS): boolean {
  if (prevAt === null) return false
  const gap = now - prevAt
  return gap >= 0 && gap <= windowMs
}

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

/** 闲逛扫视的最大偏移（px）：比指针跟随更收敛——是「瞟一眼」，不是「盯着」。 */
export const WANDER_MAX = 2.6

/**
 * 随机扫视目标：指针长时间不动时，瞳孔偶尔自己瞟向一个随机方向。
 *
 * 「活着」的感觉来自看似自主的内驱动作——视线偶尔离开正前方再回中，
 * 比任何循环动画都更像生命体。随机源注入是为了可测。
 * @param random - 随机源（默认 `Math.random`）。
 * @param max - 扫视最大半径（px）。
 * @returns 扫视目标偏移（px）。
 */
export function wanderGaze(random: () => number = Math.random, max: number = WANDER_MAX): { x: number; y: number } {
  const angle = random() * Math.PI * 2
  const radius = random() * max
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/**
 * 下次扫视要等多久（ms）：2.4s–5.6s 之间随机。
 *
 * 间隔不规律才像自己的主意；固定周期扫视像钟表，反而假。
 * @param random - 随机源（默认 `Math.random`）。
 * @returns 等待时长（ms）。
 */
export function wanderDelay(random: () => number = Math.random): number {
  return 2400 + random() * 3200
}

/** 入场动画的种类（登场时随机挑一个）。 */
export type PetEntrance = 'pop' | 'drop' | 'spin' | 'hop'

/** 全部入场动画。 */
export const ENTRANCES: readonly PetEntrance[] = ['pop', 'drop', 'spin', 'hop']

/** 各入场动画的时长（ms），与 CSS 段一一对应。 */
export const ENTRANCE_MS: Readonly<Record<PetEntrance, number>> = {
  pop: 620,
  drop: 760,
  spin: 780,
  hop: 700,
}

/**
 * 随机挑一个入场动画：每次登场方式都不同，重逢才有惊喜。
 * @param random - 随机源（默认 `Math.random`）。
 * @returns 入场动画种类。
 */
export function pickEntrance(random: () => number = Math.random): PetEntrance {
  const index = Math.floor(random() * ENTRANCES.length)
  return ENTRANCES[Math.min(index, ENTRANCES.length - 1)]!
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
