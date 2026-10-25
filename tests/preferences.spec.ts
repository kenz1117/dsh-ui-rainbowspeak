/**
 * 偏好模块测试：夹紧校验（durable 边界）、localStorage 回读与 <html> 下发。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { applyPrefs, clampPrefs, DEFAULT_PREFS, loadPrefs, savePrefs } from '../src/client/preferences.ts'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-rainbow-off')
  document.documentElement.removeAttribute('data-rainbow-palette')
  document.documentElement.removeAttribute('data-rainbow-side')
  document.documentElement.removeAttribute('data-rainbow-breathe')
  document.documentElement.removeAttribute('data-pet-off')
  document.documentElement.removeAttribute('data-pet-scope')
  document.documentElement.removeAttribute('style')
})

describe('clampPrefs', () => {
  it('畸形输入全部回落默认', () => {
    expect(clampPrefs(undefined)).toEqual({ ...DEFAULT_PREFS })
    expect(clampPrefs({ enabled: 'yes', periodSec: 'fast', palette: 'neon' })).toEqual({ ...DEFAULT_PREFS })
  })

  it('数值越界夹紧到区间，枚举非法回落默认', () => {
    const clamped = clampPrefs({ periodSec: 99, widthPx: 0, palette: 'aurora', side: 'diagonal' })
    expect(clamped.periodSec).toBe(10)
    expect(clamped.widthPx).toBe(1)
    expect(clamped.palette).toBe('aurora')
    expect(clamped.side).toBe('all')
  })

  it('cyberpunk 与 theme 是合法枚举', () => {
    expect(clampPrefs({ palette: 'cyberpunk' }).palette).toBe('cyberpunk')
    expect(clampPrefs({ palette: 'theme' }).palette).toBe('theme')
  })

  it('桌宠尺寸夹紧到 0.6-1.6，作用域非法回落默认', () => {
    expect(clampPrefs({ petScale: 99 }).petScale).toBe(1.6)
    expect(clampPrefs({ petScale: 0 }).petScale).toBe(0.6)
    expect(clampPrefs({ petScale: 1.25 }).petScale).toBe(1.3)
    expect(clampPrefs({ petScope: 'none' }).petScope).toBe('all')
    expect(clampPrefs({ petScope: 'current' }).petScope).toBe('current')
  })

  it('动画强度三档合法，非法回落默认', () => {
    expect(clampPrefs({ petMotion: 'full' }).petMotion).toBe('full')
    expect(clampPrefs({ petMotion: 'subtle' }).petMotion).toBe('subtle')
    expect(clampPrefs({ petMotion: 'off' }).petMotion).toBe('off')
    expect(clampPrefs({ petMotion: 'wild' }).petMotion).toBe('full')
    expect(clampPrefs({ petMotion: 3 }).petMotion).toBe('full')
  })

  it('桌宠坐标只接受有限数，畸形值回落默认落位', () => {
    expect(clampPrefs({ petX: 12, petY: 34 }).petX).toBe(12)
    expect(clampPrefs({ petX: 'left', petY: Number.NaN }).petX).toBeNull()
    expect(clampPrefs({ petY: Number.POSITIVE_INFINITY }).petY).toBeNull()
  })
})

describe('loadPrefs / savePrefs', () => {
  it('空存储返回默认；写入后原样回读', () => {
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS })
    const saved = { ...DEFAULT_PREFS, palette: 'sunset' as const, reverse: true, periodSec: 7 }
    savePrefs(saved)
    expect(loadPrefs()).toEqual(saved)
  })

  it('存储损坏（非 JSON）回落默认而不抛错', () => {
    localStorage.setItem('dsh-ui-rainbowspeak.prefs', '{broken')
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS })
  })
})

describe('applyPrefs', () => {
  it('布尔/枚举写 data 属性、数值写 CSS 变量、反向写 direction', () => {
    applyPrefs({ ...DEFAULT_PREFS, enabled: false, periodSec: 2, widthPx: 5, palette: 'ocean', reverse: true, side: 'top', breathe: true })
    const root = document.documentElement
    expect(root.dataset.rainbowOff).toBe('1')
    expect(root.dataset.rainbowPalette).toBe('ocean')
    expect(root.dataset.rainbowSide).toBe('top')
    expect(root.dataset.rainbowBreathe).toBe('1')
    const style = root.getAttribute('style') ?? ''
    expect(style).toContain('--dsh-rainbow-period: 2s')
    expect(style).toContain('--dsh-rainbow-width: 5px')
    expect(style).toContain('--dsh-rainbow-direction: reverse')
  })

  it('enabled/breathe 关闭时不留属性（开关只经属性存在性表达）', () => {
    applyPrefs({ ...DEFAULT_PREFS, enabled: true, breathe: false })
    expect(document.documentElement.dataset.rainbowOff).toBeUndefined()
    expect(document.documentElement.dataset.rainbowBreathe).toBeUndefined()
  })

  it('桌宠偏好下发为 data-pet-* 与尺寸变量', () => {
    applyPrefs({ ...DEFAULT_PREFS, petEnabled: false, petScope: 'current', petScale: 1.5 })
    const root = document.documentElement
    expect(root.dataset.petOff).toBe('1')
    expect(root.dataset.petScope).toBe('current')
    expect(root.getAttribute('style') ?? '').toContain('--dsh-pet-size: 156px')
  })

  it('下发偏好会广播变更事件（桌宠据此刷新）', () => {
    const seen: unknown[] = []
    const listener = (event: Event) => { seen.push((event as CustomEvent<unknown>).detail) }
    window.addEventListener('dsh-ui-rainbowspeak:prefs', listener)
    applyPrefs({ ...DEFAULT_PREFS, palette: 'ocean' })
    window.removeEventListener('dsh-ui-rainbowspeak:prefs', listener)
    expect(seen).toHaveLength(1)
  })
})
