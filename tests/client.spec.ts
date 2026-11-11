/**
 * client 半冒烟测试：样式表注入、特征断言与卸载清理。
 * jsdom 环境下直接调用 apply，用假 ctx 记录 effect 工厂与 disposer。
 * apply 还会注册 locale/slots——假 ctx 提供 minimal 形状即可。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

/** 测试假 ctx：记录 effect 工厂返回的 disposer，立即执行工厂体（模拟 cordis effect 语义）。 */
function fakeCtx() {
  const disposers: Array<() => void> = []
  const locale = {
    register: () => () => {},
    bind: () => (key: string) => key,
    subscribe: () => () => {},
  }
  return {
    disposers,
    effect(factory: () => (() => void) | void, _label?: string) {
      const disposer = factory()
      if (typeof disposer === 'function') disposers.push(disposer)
      return { dispose: () => disposers.at(-1)?.() }
    },
    locale,
    slots: {
      inject: () => () => {},
      register: () => () => {},
    },
    // 远端运行时缺席：子 fiber 静静等着（回调不触发），桌宠安静降级。
    inject: () => () => {},
  } as never as Parameters<typeof apply>[0]
}

/** 所有 effect disposer 依次执行（模拟插件卸载）。 */
function disposeAll(ctx: ReturnType<typeof fakeCtx>): void {
  for (const dispose of (ctx as unknown as { disposers: Array<() => void> }).disposers) dispose()
}

describe('client apply', () => {
  afterEach(() => {
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-rainbow-off')
    document.documentElement.removeAttribute('data-rainbow-palette')
    document.documentElement.removeAttribute('data-rainbow-side')
    document.documentElement.removeAttribute('data-rainbow-breathe')
    document.documentElement.removeAttribute('data-rainbow-glow')
    document.documentElement.removeAttribute('data-rainbow-state')
    document.documentElement.removeAttribute('style')
    localStorage.clear()
  })

  it('注入一个 style 标签并携带插件归属标识', () => {
    apply(fakeCtx())
    const tag = document.head.querySelector('style[data-plugin="@kenz1117/dsh-ui-rainbowspeak"]')
    expect(tag).not.toBeNull()
    expect(tag?.textContent).toContain('[data-composer-card]')
  })

  it('样式表覆盖实现要素：旋转图层、conic-gradient、mask 挖空、keyframes、配色/位置/状态/开关块与降级', () => {
    apply(fakeCtx())
    const css = document.head.querySelector('style[data-plugin]')?.textContent ?? ''
    // 流动由合成器承担：载体层管遮罩，色彩层自转。
    expect(css).toContain('.rs-ring')
    expect(css).toContain('.rs-conic')
    expect(css).toContain('@keyframes dsh-rainbow-spin')
    expect(css).toContain('rotate(360deg)')
    // 静态兜底：图层没注入时也有一圈描边。
    expect(css).toContain('.rs-has-ring::before')
    expect(css).toContain('conic-gradient(')
    expect(css).toContain('mask-composite: exclude')
    // P0：7 种配色方案段 + 显示位置段 + 总开关段。
    for (const palette of ['rainbow', 'aurora', 'sunset', 'peach', 'ocean', 'cyberpunk', 'theme']) {
      expect(css).toContain(`data-rainbow-palette="${palette}"`)
    }
    expect(css).toContain('data-rainbow-side="top"')
    expect(css).toContain('data-rainbow-side="bottom"')
    expect(css).toContain('html[data-rainbow-off]')
    // P1：运行加速 + 审批等待 + 错误警示段。
    expect(css).toContain('data-rainbow-state="running"')
    expect(css).toContain('data-rainbow-state="attention"')
    expect(css).toContain('data-rainbow-state="error"')
    expect(css).toContain('@keyframes dsh-rainbow-error-pulse')
    // 拓展：完成庆祝 + 聚焦增强段。
    expect(css).toContain('html[data-rainbow-celebrate]')
    expect(css).toContain('@keyframes dsh-rainbow-celebrate')
    expect(css).toContain(':focus-within::before')
    // P2：呼吸明暗段。
    expect(css).toContain('html[data-rainbow-breathe]')
    // P3：柔光层段（默认隐藏 + 开关点亮 + 几何常量 + 条带镜像）。
    expect(css).toContain('.rs-glow')
    expect(css).toContain('.rs-glow-band')
    expect(css).toContain('html[data-rainbow-glow]')
    expect(css).toContain('--dsh-rainbow-glow-extent')
    expect(css).toContain('--dsh-rainbow-glow-blur')
    expect(css).toContain('--dsh-rainbow-glow-opacity')
    // 系统偏好降级。
    expect(css).toContain('prefers-reduced-motion')
  })

  it('旋转图层与柔光层：注入载体/色彩/柔光层，柔光垫在细线之下，卸载时清干净', () => {
    const ctx = fakeCtx()
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    document.body.appendChild(card)
    apply(ctx)
    const ring = card.querySelector('.rs-ring')
    const conic = card.querySelector('.rs-conic')
    const glow = card.querySelector('.rs-glow')
    const band = card.querySelector('.rs-glow-band')
    expect(ring).not.toBeNull()
    expect(conic).not.toBeNull()
    expect(conic?.parentElement?.className).toContain('rs-ring')
    expect(glow).not.toBeNull()
    expect(band?.parentElement).toBe(glow)
    expect(card.classList.contains('rs-has-ring')).toBe(true)
    // 柔光层先注入：细线后画，正好压住光晕内缘的硬切。
    expect(card.children[0]).toBe(glow)
    expect(card.children[1]).toBe(ring)
    // 重复注入不应叠出第二层。
    apply(ctx)
    expect(card.querySelectorAll('.rs-ring').length).toBe(1)
    expect(card.querySelectorAll('.rs-glow').length).toBe(1)
    // 卸载：注入的 DOM 与标记都要清掉。
    disposeAll(ctx)
    expect(card.querySelector('.rs-ring')).toBeNull()
    expect(card.querySelector('.rs-glow')).toBeNull()
    expect(card.classList.contains('rs-has-ring')).toBe(false)
    card.remove()
  })

  it('apply 下发默认偏好到 <html>（无存储值时）', () => {
    apply(fakeCtx())
    const root = document.documentElement
    expect(root.dataset.rainbowPalette).toBe('rainbow')
    expect(root.dataset.rainbowSide).toBe('all')
    expect(root.getAttribute('style')).toContain('--dsh-rainbow-period: 4s')
    expect(root.getAttribute('style')).toContain('--dsh-rainbow-width: 2px')
    expect(root.dataset.rainbowOff).toBeUndefined()
    expect(root.dataset.rainbowGlow).toBeUndefined()
  })

  it('插件卸载清理：样式表标签与 <html> 标记/变量全部移除', () => {
    const ctx = fakeCtx()
    // 预置柔光开启：apply 下发 data-rainbow-glow，卸载时必须一并清掉。
    localStorage.setItem('dsh-ui-rainbowspeak.prefs', JSON.stringify({ glow: true }))
    apply(ctx)
    expect(document.head.querySelector('style[data-plugin]')).not.toBeNull()
    expect(document.documentElement.dataset.rainbowGlow).toBe('1')
    disposeAll(ctx)
    expect(document.head.querySelector('style[data-plugin]')).toBeNull()
    const root = document.documentElement
    expect(root.dataset.rainbowPalette).toBeUndefined()
    expect(root.dataset.rainbowGlow).toBeUndefined()
    expect(root.getAttribute('style')).not.toContain('--dsh-rainbow-period')
  })
})
