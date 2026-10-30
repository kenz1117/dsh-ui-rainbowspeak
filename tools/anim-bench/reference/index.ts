/**
 * Composer rainbow 装饰插件，浏览器半。
 *
 * 给聊天输入框卡片（宿主稳定锚点 `[data-composer-card]`，由 ui-conversation
 * InputBar 在卡片元素上打点）注入一条沿边界持续流动的彩虹跑马灯边框，
 * 并提供设置页「彩虹边框」section 与会话状态桥。
 *
 * 样式表（一个 `<style data-plugin>` 标签）只承载静态结构；用户偏好与会话状态
 * 经 `<html>` 的 `data-rainbow-*` 标记与 `--dsh-rainbow-*` 变量实时下发
 * （preferences/state-bridge），变更即时生效、无需重建样式表。
 *
 * - `::before` 伪元素画 `conic-gradient` 全色谱环，`mask` 挖空中部只留边缘
 *   环带（环外缘贴合卡片 22px 圆角，宽度 `--dsh-rainbow-width`）；
 * - `@property` 把 `--dsh-rainbow-angle` 注册为 `<angle>`，使其可被 keyframes
 *   插值——动画推进锥形渐变的起始角，颜色即沿周长持续流动（跑马灯）；
 *   不支持 `@property` 的引擎自动降级为静态彩虹描边；
 * - 会话状态桥把 running/promptError/lastAgentError 与审批等待投影为
 *   `data-rainbow-state`（error > attention > running 优先级），运行中自动
 *   加速、审批等待琥珀脉冲、出错切红色警示；回合完成瞬间打
 *   `data-rainbow-celebrate` 快转一圈庆祝；
 * - 输入框聚焦时环提亮增饱和（`:focus-within`）；
 * - `prefers-reduced-motion` 下停用全部动画（保留静态描边）。
 *
 * style 标签随插件 effect 生命周期挂载/卸载，重复 apply 幂等由 effect 一次性保证。
 * @module @kenz1117/dsh-ui-rainbowspeak/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: ctx.locale 服务声明（宿主 locale 插件的 Context merge）。
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: ctx.slots（renderer 的 SlotMap 渲染接线）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: settings.section 槽位的 SlotMap merge（ui-settings 契约）。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: conversation.composer.dock 槽位的 SlotMap merge（ui-conversation 契约）。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: shell.overlay 槽位的 SlotMap merge（ui-layout 契约）——桌宠的落座处。
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: SessionStandardProps merge（useSession 席位类型）。
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: LocaleNamespaceMap 声明合并目标（t 席位的键类型检查）。
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { RainbowStateBridge } from './state-bridge.tsx'
import { RainbowSettingsSection } from './settings.tsx'
import { NS, en, zh, type RainbowKey } from './locales.ts'
import { applyPrefs, loadPrefs } from './preferences.ts'
import { PALETTE_STOPS } from './palettes.ts'
import { PetRoot } from './pet.tsx'
import { startPetRemote } from './pet-remote.ts'
import { bindPetLocale } from './pet-locale.ts'

/** 词典键合并进宿主 LocaleNamespaceMap：t 席位按本插件命名空间做键类型检查。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [NS]: RainbowKey
  }
}

/** 生成注入的样式表全文（配色方案段由 PALETTE_STOPS 展开）。 */
function rainbowCss(): string {
  const paletteBlocks = Object.entries(PALETTE_STOPS)
    .map(([name, stops]) => `
/* 配色方案：${name}。 */
html[data-rainbow-palette="${name}"] [data-composer-card]::before {
  background: conic-gradient(from var(--dsh-rainbow-angle), ${stops});
}`)
    .join('\n')
  return `
/* 彩虹流动相位：注册为 <angle> 才能被 keyframes 插值（Chromium/Electron 支持）。 */
@property --dsh-rainbow-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* 默认变量：偏好服务在 <html> 上以内联样式覆盖（inline 优先于 :root 声明）。 */
:root {
  --dsh-rainbow-width: 2px;
  --dsh-rainbow-period: 4s;
  --dsh-rainbow-direction: normal;
}

/* 宿主输入框卡片（ui-conversation InputBar 的稳定 data 锚点）。 */
[data-composer-card] {
  position: relative;
}

/* 彩虹跑马灯环：conic-gradient 全色谱 + mask 挖空中部，只留边缘环带。
   ::before 画在卡片背景之上；pointer-events 关闭，不拦截任何交互。 */
[data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: var(--dsh-rainbow-width);
  background: conic-gradient(from var(--dsh-rainbow-angle), ${PALETTE_STOPS.rainbow});
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: dsh-rainbow-flow var(--dsh-rainbow-period) linear infinite;
  animation-direction: var(--dsh-rainbow-direction);
  pointer-events: none;
  transition: filter 0.3s ease;
}

@keyframes dsh-rainbow-flow {
  to { --dsh-rainbow-angle: 360deg; }
}
${paletteBlocks}

/* 显示位置：仅顶边（mask 只保留顶部条带，颜色仍是环上对应弧段，随角度流动）。 */
html[data-rainbow-side="top"] [data-composer-card]::before {
  -webkit-mask: linear-gradient(180deg, #fff 0 var(--dsh-rainbow-width), transparent var(--dsh-rainbow-width));
  mask: linear-gradient(180deg, #fff 0 var(--dsh-rainbow-width), transparent var(--dsh-rainbow-width));
}

/* 显示位置：仅底边。 */
html[data-rainbow-side="bottom"] [data-composer-card]::before {
  -webkit-mask: linear-gradient(180deg, transparent calc(100% - var(--dsh-rainbow-width)), #fff calc(100% - var(--dsh-rainbow-width)));
  mask: linear-gradient(180deg, transparent calc(100% - var(--dsh-rainbow-width)), #fff calc(100% - var(--dsh-rainbow-width)));
}

/* 呼吸明暗：叠加第二个动画（opacity 周期变化，周期随流速放大一倍）。 */
@keyframes dsh-rainbow-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

html[data-rainbow-breathe] [data-composer-card]::before {
  animation: dsh-rainbow-flow var(--dsh-rainbow-period) linear infinite,
    dsh-rainbow-breathe calc(var(--dsh-rainbow-period) * 2) ease-in-out infinite;
}

/* 会话运行中：流动加速（状态桥把 running 投影到 <html data-rainbow-state>）。 */
html[data-rainbow-state="running"] [data-composer-card] {
  --dsh-rainbow-period: 1.2s;
}

/* 审批等待：琥珀色配色 + 缓慢脉冲（pendingInteraction 由状态桥投影）。 */
html[data-rainbow-state="attention"] [data-composer-card]::before {
  background: conic-gradient(from var(--dsh-rainbow-angle), #f59e0b, #fbbf24, #fcd34d, #f59e0b, #d97706, #f59e0b);
  animation: dsh-rainbow-flow 3s linear infinite, dsh-rainbow-error-pulse 2s ease-in-out infinite;
}

/* 会话出错：红色警示配色 + 快速脉冲。 */
@keyframes dsh-rainbow-error-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

html[data-rainbow-state="error"] [data-composer-card]::before {
  background: conic-gradient(from var(--dsh-rainbow-angle), #ef4444, #f87171, #fca5a5, #ef4444, #dc2626, #ef4444);
  animation: dsh-rainbow-flow 1s linear infinite, dsh-rainbow-error-pulse 1.2s ease-in-out infinite;
}

/* 回合完成庆祝：快转一圈并提亮回落（标记由状态桥 0.9s 后移除）。
   首尾 opacity 都等于常态 1，起止平滑。 */
@keyframes dsh-rainbow-celebrate {
  0% { opacity: 1; }
  40% { opacity: 1; }
  60% { opacity: 0.4; }
  100% { opacity: 1; }
}

html[data-rainbow-celebrate] [data-composer-card]::before {
  animation: dsh-rainbow-flow 0.9s linear 1, dsh-rainbow-celebrate 0.9s ease-out 1;
}

/* 输入框聚焦时环更亮更饱和，失焦平滑回落。 */
[data-composer-card]:focus-within::before {
  filter: brightness(1.25) saturate(1.15);
}

/* 总开关关闭：隐藏伪元素（偏好服务在 <html data-rainbow-off> 上打标记）。 */
html[data-rainbow-off] [data-composer-card]::before {
  display: none;
}

/* 用户开启"减弱动态效果"时停用全部动画，保留静态描边。 */
@media (prefers-reduced-motion: reduce) {
  [data-composer-card]::before {
    animation: none;
  }
}
`
}

/** style 标签的 data-plugin 标识（宿主按此归属插件样式，卸载时清理）。 */
const PLUGIN_ID = '@kenz1117/dsh-ui-rainbowspeak'

/** 构建标识：排查「宿主跑的是旧包」时，在宿主控制台按这行确认加载的是哪一版。 */
const CLIENT_BUILD = '2026-10-28.6 (css candy hearts)'

/** 必需服务：slots 渲染接线 + locale 词典注册。 */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: 挂载样式表、下发初始偏好，并注册 locale 词典、
 * 设置页「彩虹边框」section（order 90，排在既有 section 之后）与会话状态桥。
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  try {
    applyInner(ctx)
  } catch (error) {
    // 宿主只在启动汇总里报「entry failed」，不给原因——这里补一条可读的现场。
    console.error('[dsh-ui-rainbowspeak] client apply failed', error)
    throw error
  }
}

function applyInner(ctx: Context): void {
  console.info(`[dsh-ui-rainbowspeak] client build ${CLIENT_BUILD}`)
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.textContent = rainbowCss()
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'ui-rainbowspeak: rainbow border stylesheet')
  // 初始偏好下发（localStorage 已有值时恢复上次的开关/速度/配色等）。
  ctx.effect(() => {
    applyPrefs(loadPrefs())
    return () => {
      // 插件卸载时清掉自己写入的标记与变量，宿主不留残留属性。
      const root = document.documentElement
      delete root.dataset.rainbowOff
      delete root.dataset.rainbowPalette
      delete root.dataset.rainbowSide
      delete root.dataset.rainbowBreathe
      root.style.removeProperty('--dsh-rainbow-period')
      root.style.removeProperty('--dsh-rainbow-width')
      root.style.removeProperty('--dsh-rainbow-direction')
    }
  }, 'ui-rainbowspeak: initial preference application')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-rainbowspeak: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'rainbowspeak',
    order: 90,
    label: () => t('nav'),
    locale: NS,
  }, RainbowSettingsSection))
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'rainbowspeak-state',
    order: 90,
  }, RainbowStateBridge))
  // 桌宠：接上宿主的权威回合边界流（Typert 远端），再落座到窗口浮动层。
  //
  // 远端运行时（API Gateway）是**可选**依赖：Cordis 只允许在声明过的 inject 里
  // 取服务，直接摸 `ctx.remote` 会抛 "cannot get property"。所以这里用子 fiber
  // 声明 'remote'——网关缺席时子 fiber 静静等着，父插件照常激活，桌宠退回
  // 「只看客户端会话状态」，只是不报喜（没有权威事件就不该报喜）。
  ctx.inject(['remote'], (remoteScope) => {
    remoteScope.effect(() => {
      const handle = startPetRemote(remoteScope)
      return () => { handle.dispose() }
    }, 'ui-rainbowspeak: pet remote')
  })
  // 桌宠住在根作用域，拿不到 settings 注入的 t 席位，故单独接一条文案桥。
  ctx.effect(() => {
    const bound = t as unknown as (key: RainbowKey) => string
    bindPetLocale(bound)
    const off = ctx.locale.subscribe(() => { bindPetLocale(bound) })
    return () => { off() }
  }, 'ui-rainbowspeak: pet locale')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'rainbowspeak-pet',
    order: 90,
  }, PetRoot))
}