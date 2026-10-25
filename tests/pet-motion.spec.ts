/**
 * 桌宠互动纯计算测试：台词轮换、视线夹紧、闲逛扫视、连戳判定、摆动角、挤压曲线。
 */
import { describe, expect, it } from 'vitest'
import { ENTRANCES, ENTRANCE_MS, HUM_LINES, humDelay, isRapidPoke, lookVector, LONG_PRESS_MS, PAT_LINES, pickEntrance, pickKey, POKE_LINES, SPIN_LINES, squashCurve, STARTLE_LINES, STATE_LINES, swingAngle, wanderDelay, wanderGaze, WANDER_MAX } from '../src/client/pet-motion.ts'
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

  it('每个状态都有两句台词，戳击台词至少五句，反应台词至少两句', () => {
    const states: PetState[] = ['resting', 'working', 'waiting', 'celebrating', 'error', 'sleeping']
    for (const state of states) {
      expect(STATE_LINES[state]).toHaveLength(2)
      expect(STATE_LINES[state][0]).not.toBe(STATE_LINES[state][1])
    }
    expect(POKE_LINES.length).toBeGreaterThanOrEqual(5)
    expect(SPIN_LINES.length).toBeGreaterThanOrEqual(2)
    expect(PAT_LINES.length).toBeGreaterThanOrEqual(2)
    expect(STARTLE_LINES.length).toBeGreaterThanOrEqual(2)
    expect(HUM_LINES.length).toBeGreaterThanOrEqual(2)
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

describe('wanderGaze', () => {
  it('扫视目标始终在半径内', () => {
    // 全随机源扫一遍：任何随机数组合都不该把瞳孔扫出眼眶。
    for (let i = 0; i < 200; i++) {
      const target = wanderGaze(Math.random)
      expect(Math.hypot(target.x, target.y)).toBeLessThanOrEqual(WANDER_MAX + 1e-9)
    }
  })

  it('随机源确定时结果可复现（可测性）', () => {
    const fixed = (): number => 0.25
    expect(wanderGaze(fixed, 4)).toEqual(wanderGaze(fixed, 4))
  })

  it('零随机数时目标在正中', () => {
    const zero = (): number => 0
    expect(wanderGaze(zero, 4)).toEqual({ x: 0, y: 0 })
  })
})

describe('wanderDelay', () => {
  it('延迟在 2.4s–5.6s 区间内', () => {
    for (let i = 0; i < 200; i++) {
      const delay = wanderDelay(Math.random)
      expect(delay).toBeGreaterThanOrEqual(2400)
      expect(delay).toBeLessThanOrEqual(5600)
    }
  })

  it('区间端点可取到（随机源注入）', () => {
    expect(wanderDelay(() => 0)).toBe(2400)
    expect(wanderDelay(() => 1)).toBe(5600)
  })
})

describe('humDelay', () => {
  it('冷却在 36s–60s 区间内', () => {
    for (let i = 0; i < 200; i++) {
      const delay = humDelay(Math.random)
      expect(delay).toBeGreaterThanOrEqual(36000)
      expect(delay).toBeLessThanOrEqual(60000)
    }
  })

  it('区间端点可取到（随机源注入）', () => {
    expect(humDelay(() => 0)).toBe(36000)
    expect(humDelay(() => 1)).toBe(60000)
  })
})

describe('pickEntrance', () => {
  it('任何随机源都返回合法入场动画（含 random()=1 的越界边缘）', () => {
    for (let i = 0; i < 200; i++) {
      expect(ENTRANCES).toContain(pickEntrance(Math.random))
    }
    expect(ENTRANCES).toContain(pickEntrance(() => 0))
    expect(ENTRANCES).toContain(pickEntrance(() => 1))
  })

  it('每个入场动画都有时长', () => {
    for (const kind of ENTRANCES) {
      expect(ENTRANCE_MS[kind]).toBeGreaterThan(0)
    }
  })
})

describe('isRapidPoke', () => {
  it('从未戳过不算连戳', () => {
    expect(isRapidPoke(null, 1000)).toBe(false)
  })

  it('间隔落在窗口内算连戳（含端点）', () => {
    expect(isRapidPoke(1000, 1180)).toBe(true)
    expect(isRapidPoke(1000, 1320)).toBe(true)
    expect(isRapidPoke(1000, 1000)).toBe(true)
  })

  it('超出窗口不算', () => {
    expect(isRapidPoke(1000, 1321)).toBe(false)
    expect(isRapidPoke(1000, 5000)).toBe(false)
  })

  it('自定义窗口生效', () => {
    expect(isRapidPoke(1000, 1500, 600)).toBe(true)
    expect(isRapidPoke(1000, 1500, 400)).toBe(false)
  })

  it('长按时长为正的合理值', () => {
    expect(LONG_PRESS_MS).toBeGreaterThan(300)
    expect(LONG_PRESS_MS).toBeLessThan(1500)
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
