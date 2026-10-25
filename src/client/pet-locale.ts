/**
 * 桌宠的文案桥：把宿主 locale 服务接进组件。
 *
 * 桌宠挂在 `shell.overlay`（根作用域），而 `t` 席位是 `settings.section`
 * 注入时带来的——桌宠拿不到。于是这里留一条极窄的桥：插件在 `apply` 里把
 * 绑定好的翻译函数交给本模块，组件用 `useSyncExternalStore` 订阅版本号，
 * 宿主语言一变就重渲染。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet-locale
 */

import type { RainbowKey } from './locales.ts'

/** 翻译函数（与宿主 `t` 席位同形）。 */
export type TranslateFn = (key: RainbowKey) => string

const listeners = new Set<() => void>()

let translate: TranslateFn = (key) => key
let revision = 0

/**
 * 绑定翻译函数并通知订阅者重渲染。
 * @param bound - 宿主绑定好的翻译函数。
 */
export function bindPetLocale(bound: TranslateFn): void {
  translate = bound
  revision += 1
  for (const listener of [...listeners]) listener()
}

/**
 * 读取当前版本号（`useSyncExternalStore` 的快照）。
 * @returns 单调递增的版本号。
 */
export function getPetLocaleRevision(): number {
  return revision
}

/**
 * 订阅版本变化。
 * @param listener - 变更回调。
 * @returns 退订函数。
 */
export function subscribePetLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * 翻译一个键（按当前生效语言）。
 * @param key - 词典键。
 * @returns 译文。
 */
export function translatePet(key: RainbowKey): string {
  return translate(key)
}
