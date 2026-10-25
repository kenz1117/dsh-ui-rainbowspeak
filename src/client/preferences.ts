/**
 * 偏好模型与下发：localStorage 持久化 + `<html>` 属性与 CSS 变量实时下发。
 *
 * 设置面板是唯一写入者（savePrefs 内同步 applyPrefs）；注入的样式表消费
 * `data-rainbow-*` 标记与 `--dsh-rainbow-*` 变量，两端经此文件解耦。
 * localStorage 读取按 durable 数据边界处理：逐字段校验并夹紧到合法区间，
 * 任何畸形 JSON 或越界值回落默认项，绝不让坏数据进入渲染。
 *
 * 桌宠偏好同在此处：它住在 `shell.overlay`（根作用域），与设置面板没有父子
 * 关系，所以「偏好变了」靠一条自定义事件广播，组件自己订阅刷新。
 * @module @kenz1117/dsh-ui-rainbowspeak/client/preferences
 */

import type { PetScope } from './pet-state.ts'

/** 配色方案（CSS 里每种方案一段 conic-gradient 色标；theme 跟随宿主品牌色）。 */
export type RainbowPalette = 'rainbow' | 'aurora' | 'sunset' | 'peach' | 'ocean' | 'cyberpunk' | 'theme'

/** 显示位置（CSS 里 mask 保留对应条带）。 */
export type RainbowSide = 'all' | 'top' | 'bottom'

/** 全部用户偏好。 */
export interface RainbowPrefs {
  /** 总开关；关闭时样式表隐藏伪元素（不移除插件）。 */
  enabled: boolean
  /** 流动周期（秒/圈），夹紧 1-10。 */
  periodSec: number
  /** 环带宽度（px），夹紧 1-6。 */
  widthPx: number
  /** 配色方案。 */
  palette: RainbowPalette
  /** 反向流动。 */
  reverse: boolean
  /** 显示位置。 */
  side: RainbowSide
  /** 呼吸明暗叠加动画。 */
  breathe: boolean
  /** 桌宠总开关。 */
  petEnabled: boolean
  /** 桌宠关注范围：全部会话，还是只看当前会话。 */
  petScope: PetScope
  /** 桌宠尺寸倍率，夹紧 0.6-1.6。 */
  petScale: number
  /** 桌宠左上角横坐标（视口 px）；`null` 表示用默认落位。 */
  petX: number | null
  /** 桌宠左上角纵坐标（视口 px）；`null` 表示用默认落位。 */
  petY: number | null
}

/** 桌宠基础尺寸（px），与样式表里的默认尺寸一致。 */
export const PET_BASE_SIZE = 104

/** 默认偏好。 */
export const DEFAULT_PREFS: Readonly<RainbowPrefs> = Object.freeze({
  enabled: true,
  periodSec: 4,
  widthPx: 2,
  palette: 'rainbow',
  reverse: false,
  side: 'all',
  breathe: false,
  petEnabled: true,
  petScope: 'all',
  petScale: 1,
  petX: null,
  petY: null,
})

const PALETTES: readonly RainbowPalette[] = ['rainbow', 'aurora', 'sunset', 'peach', 'ocean', 'cyberpunk', 'theme']
const SIDES: readonly RainbowSide[] = ['all', 'top', 'bottom']
const PET_SCOPES: readonly PetScope[] = ['all', 'current']
const STORAGE_KEY = 'dsh-ui-rainbowspeak.prefs'

/**
 * 偏好变更事件名：设置面板写完偏好后广播，桌宠据此刷新位置与尺寸。
 */
export const PREFS_EVENT = 'dsh-ui-rainbowspeak:prefs'

/**
 * 读取一个可空的有限坐标（越界或畸形一律回落到默认落位）。
 * @param raw - 原始值。
 * @returns 坐标；不可用时为 `null`。
 */
function clampCoord(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * 把任意来源的原始值夹紧成合法偏好（localStorage 回读的校验边界）。
 * @param raw - 未校验的原始值（JSON.parse 产物或任何形状）。
 * @returns 逐字段校验后的偏好；畸形字段逐个回落默认。
 */
export function clampPrefs(raw: unknown): RainbowPrefs {
  const source = (raw ?? {}) as Partial<Record<keyof RainbowPrefs, unknown>>
  const period = typeof source.periodSec === 'number' && Number.isFinite(source.periodSec)
    ? Math.min(10, Math.max(1, Math.round(source.periodSec)))
    : DEFAULT_PREFS.periodSec
  const width = typeof source.widthPx === 'number' && Number.isFinite(source.widthPx)
    ? Math.min(6, Math.max(1, Math.round(source.widthPx)))
    : DEFAULT_PREFS.widthPx
  const scale = typeof source.petScale === 'number' && Number.isFinite(source.petScale)
    ? Math.min(1.6, Math.max(0.6, Math.round(source.petScale * 10) / 10))
    : DEFAULT_PREFS.petScale
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_PREFS.enabled,
    periodSec: period,
    widthPx: width,
    palette: PALETTES.includes(source.palette as RainbowPalette)
      ? source.palette as RainbowPalette
      : DEFAULT_PREFS.palette,
    reverse: typeof source.reverse === 'boolean' ? source.reverse : DEFAULT_PREFS.reverse,
    side: SIDES.includes(source.side as RainbowSide)
      ? source.side as RainbowSide
      : DEFAULT_PREFS.side,
    breathe: typeof source.breathe === 'boolean' ? source.breathe : DEFAULT_PREFS.breathe,
    petEnabled: typeof source.petEnabled === 'boolean' ? source.petEnabled : DEFAULT_PREFS.petEnabled,
    petScope: PET_SCOPES.includes(source.petScope as PetScope)
      ? source.petScope as PetScope
      : DEFAULT_PREFS.petScope,
    petScale: scale,
    petX: clampCoord(source.petX),
    petY: clampCoord(source.petY),
  }
}

/**
 * 从 localStorage 读取偏好。
 * @returns 夹紧后的偏好；无存储或 JSON 畸形时返回默认。
 */
export function loadPrefs(): RainbowPrefs {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    // 空存储 getItem 返回 null，JSON.parse('') 抛错——语义即「无偏好」，回落默认。
    return { ...DEFAULT_PREFS }
  }
  return clampPrefs(raw)
}

/**
 * 持久化偏好并立即下发到 `<html>`（写即生效）。
 * @param prefs - 已合法的偏好。
 */
export function savePrefs(prefs: RainbowPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  applyPrefs(prefs)
}

/**
 * 把偏好下发到 `<html>`：布尔/枚举走 data 属性，数值走内联 CSS 变量。
 * 属性名与样式表选择器一一对应（见 client/index.ts 的 RAINBOW_CSS）。
 *
 * 写完还会广播一条偏好变更事件——桌宠住在根作用域的覆盖层里，
 * 拿不到设置面板的 React 状态，只能靠这条事件刷新。
 * @param prefs - 已合法的偏好。
 */
export function applyPrefs(prefs: RainbowPrefs): void {
  const root = document.documentElement
  if (prefs.enabled) delete root.dataset.rainbowOff
  else root.dataset.rainbowOff = '1'
  root.dataset.rainbowPalette = prefs.palette
  root.dataset.rainbowSide = prefs.side
  if (prefs.breathe) root.dataset.rainbowBreathe = '1'
  else delete root.dataset.rainbowBreathe
  root.style.setProperty('--dsh-rainbow-period', `${prefs.periodSec}s`)
  root.style.setProperty('--dsh-rainbow-width', `${prefs.widthPx}px`)
  root.style.setProperty('--dsh-rainbow-direction', prefs.reverse ? 'reverse' : 'normal')
  if (prefs.petEnabled) delete root.dataset.petOff
  else root.dataset.petOff = '1'
  root.dataset.petScope = prefs.petScope
  root.style.setProperty('--dsh-pet-size', `${Math.round(PET_BASE_SIZE * prefs.petScale)}px`)
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }))
}
