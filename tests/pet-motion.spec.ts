/**
 * 桌宠互动纯计算测试：台词轮换、视线夹紧、摆动角、挤压曲线。
 */
import { describe, expect, it } from 'vitest'
import { lookVector, pickKey, POKE_LINES, STATE_LINES, squashCurve, swingAngle } from '../src/client/pet-motion.ts'
import type { RainbowKey } from '../src/client/locales.ts'
import type { PetState } from '../src/client/pet-state.ts'

describe('pickKey', () => {
  it('按序号轮换，序号回绕', () => {
    const keys: readonly RainbowKey[] = ['petResting', 'petResting2']
    expect(pickKey(keys, 0)).toBe('petResting')
    expect(pickKey(keys, 1)).toBe('petResting2')
    expect(pickKey(keys, 2)).toBe('petResting')
    expect(pickKey(keys, 5)).toBe('petResting2')
  })

  it('负序号也回绕到合法区间', () => {
    const keys: readonly RainbowKey[] = ['petResting', 'petResting2']
    expect(pickKey(keys, -1)).toBe('petResting2')
  })

  it('空池直接报错，不静默返回 undefined', () => {
    expect(() => pickKey([], 0)).toThrow()
  })

  it('每个状态都有两句台词', () => {
    const states: PetState[] = ['resting', 'working', 'waiting', 'celebrating', 'error', 'sleeping']
    for (const state of states) {
      expect(STATE_LINES[state]).toHaveLength(2)
      expect(STATE_LINES[state][0]).not.toBe(STATE_LINES[state][1])
    }
    expect(POKE_LINES.length).toBeGreaterThanOrEqual(3)
  })
})

describe('lookVector', () => {
  it('指针正右方：瞳孔向右', () => {
    const look = lookVector(100, 0, 4.5)
    expect(look.x).toBeCloseTo(4.5)
    expect(look.y).toBeCloseTo(0)
  })

  it('超出半径时夹紧在半径内', () => {
    const look = lookVector(1000, 0, 4.5)
    expect(Math.hypot(look.x, look.y)).toBeCloseTo(4.5)
  })

  it('指针重合时不动', () => {
    expect(lookVector(0, 0, 4.5)).toEqual({ x: 0, y: 0 })
  })

  it('斜向时保持方向比例', () => {
    const look = lookVector(30, 40, 100)
    expect(look.x / 30).toBeCloseTo(look.y / 40)
  })
})

describe('swingAngle', () => {
  it('向右甩为正角，向左甩为负角', () => {
    expect(swingAngle(0.02, 14)).toBeGreaterThan(0)
    expect(swingAngle(-0.02, 14)).toBeLessThan(0)
  })

  it('角度不超过上限', () => {
    expect(swingAngle(10, 14)).toBe(14)
    expect(swingAngle(-10, 14)).toBe(-14)
  })

  it('静止时不歪', () => {
    expect(swingAngle(0, 14)).toBe(0)
  })
})

describe('squashCurve', () => {
  it('起点与终点都是原形', () => {
    expect(squashCurve(0)).toEqual({ x: 1, y: 1 })
    expect(squashCurve(1)).toEqual({ x: 1, y: 1 })
  })

  it('中段是压扁的：横向变大、纵向变小', () => {
    const mid = squashCurve(0.12)
    expect(mid.x).toBeGreaterThan(1)
    expect(mid.y).toBeLessThan(1)
  })

  it('回弹段是拉长的', () => {
    const back = squashCurve(0.4)
    expect(back.y).toBeGreaterThan(1)
  })

  it('全程形变量有界，不会炸开', () => {
    for (let t = 0; t <= 1; t += 0.02) {
      const { x, y } = squashCurve(t)
      expect(x).toBeGreaterThan(0.8)
      expect(x).toBeLessThan(1.2)
      expect(y).toBeGreaterThan(0.8)
      expect(y).toBeLessThan(1.2)
    }
  })
})
