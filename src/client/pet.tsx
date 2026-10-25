/**
 * 桌宠「小虹」组件：挂在 `shell.overlay`（根作用域的浮动层）上。
 *
 * 它同时吃两路信号：
 * - 宿主回合边界流（经 Typert 远端）→ 决定「这轮到底怎么了」；
 * - 客户端会话状态（`useSessionStatus` 标准席位）→ 决定「现在谁在跑」。
 *
 * 互动是这一版的主菜：
 * - **眼睛跟着指针走**（纯 CSS 变量驱动，不触发重渲染）；指针静止久了，
 *   瞳孔还会自己随机扫视——「闲逛的目光」是活着感的大头；
 * - **戳一下**会挤压回弹、冒出台词（五句轮换）、炸开小心心；
 * - **连戳（双击）**转一个圈，转完晕一小会儿（×_×）；
 * - **按住不动**是摸摸：果冻鼓起、腮红拉满；
 * - **拖着走**时它顺着惯性歪，像被吊在指尖；
 * - **右键**弹出小菜单：关注范围 / 大小 / 让它躲起来；
 * - 它也感知环境：窗口被拖大拖小会踉跄一下，睡醒会伸懒腰，
 *   有人滚聊天记录时目光跟着内容走一点。
 * 动画强度三档（全量 / 轻柔 / 关）经 `data-motion` 下发，设置面板可调。
 *
 * 形象是纯 CSS 几何，没有任何外部素材——因此没有第三方形象的授权问题。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './pet.module.css'
import { derivePetState, noticeFromReason, readCurrentSessionId, scopeActivity, SESSION_EVENT, type PetNotice, type PetState } from './pet-state.ts'
import { isRapidPoke, LONG_PRESS_MS, lookVector, PAT_LINES, pickKey, POKE_LINES, SPIN_LINES, STATE_LINES, swingAngle, wanderDelay, wanderGaze } from './pet-motion.ts'
import { subscribeFrames, subscribeHealth } from './pet-store.ts'
import { getPetLocaleRevision, subscribePetLocale, translatePet } from './pet-locale.ts'
import { PREFS_EVENT, loadPrefs, savePrefs, PET_BASE_SIZE, type RainbowPrefs } from './preferences.ts'
import type { RainbowKey } from './locales.ts'
import type { PetScope } from './pet-state.ts'

/** 瞳孔最大偏移（px）：眼睛挪一点，不挪出眼眶。 */
const LOOK_MAX = 4.5

/** 指针静止多久后，瞳孔开始自己闲逛扫视（ms）。 */
const LOOK_IDLE_MS = 3000

/** 一次扫视后的回中时间（ms）：瞟一眼，看一会儿，目光回巢。 */
const WANDER_RECOVER_MS = 900

/** 踉跄反应的防抖（ms）：拖动窗口把手会连发 resize，只认停下来的那一下。 */
const STUMBLE_DEBOUNCE_MS = 220

/** 踉跄动画时长（ms），与 CSS pet-stumble 周期一致。 */
const STUMBLE_MS = 720

/** 转圈动画时长（ms），与 CSS pet-spin 周期一致。 */
const SPIN_MS = 800

/** 转圈后晕圈（×_×）的停留时长（ms）。 */
const DIZZY_MS = 1250

/** 摸摸的果冻鼓起动画时长（ms），与 CSS pet-pat 周期一致。 */
const PAT_MS = 900

/** 睡醒伸懒腰时长（ms），与 CSS pet-stretch 周期一致。 */
const STRETCH_MS = 950

/** 滚动目光：两次滚动反应的最小间隔（ms），滚动是高频事件，不能跟着抽动。 */
const SCROLL_GAZE_INTERVAL_MS = 600

/** 滚动目光：多大的滚动位移才值得看一眼（px）。 */
const SCROLL_GAZE_MIN_DELTA = 24

/** 滚动目光：指针最近多久动过才算「闲着」（ms）——指针在动就只跟指针。 */
const SCROLL_GAZE_POINTER_IDLE_MS = 2500

/** 一次性台词的展示时长（ms）。 */
const FLASH_MS = 2200

/**
 * 身体剪影（viewBox 0 0 100 100）：圆润的胖椭圆——角色的基础形。
 * 路径绘制是为了免疫宿主对 border-radius 的干扰（实测被渲染成圆角方块）。
 */
const DROP_PATH = 'M 50 6 C 73.2 6 92 23.9 92 46 C 92 68.1 73.2 86 50 86 C 26.8 86 8 68.1 8 46 C 8 23.9 26.8 6 50 6 Z'

/** 同一路径的 objectBoundingBox 版（坐标 0-1，供 clipPathUnits 消费）。 */
const DROP_PATH_BB = 'M 0.5 0.06 C 0.732 0.06 0.92 0.239 0.92 0.46 C 0.92 0.681 0.732 0.86 0.5 0.86 C 0.268 0.86 0.08 0.681 0.08 0.46 C 0.08 0.239 0.268 0.06 0.5 0.06 Z'

/** 头顶呆毛：小水滴形，尖端朝右上、根部埋进头顶。独立路径，随状态换色。 */
const TIP_PATH = 'M 69 -5 C 63.5 -1.5 56.5 3.5 54 9 C 51.8 14 54.5 18.6 59.5 19 C 64.5 19.4 67.8 15.8 67.5 10.5 C 67.3 6 68 -0.5 69 -5 Z'

/** clipPath 的 id（body 的 clip-path 引用同文档内联 SVG；呆毛渐变 id 见组件 defs）。 */
const DROP_CLIP_ID = 'rainbowspeak-drop'

/** 挤压回弹的时长（ms）。 */
const SQUASH_MS = 420

/** 戳击台词的停留时长（ms）。 */
const POKE_MS = 2600

/** 菜单里的三档尺寸倍率。 */
const SIZE_OPTIONS: readonly { readonly value: number; readonly key: RainbowKey }[] = [
  { value: 0.7, key: 'petMenuSizeSmall' },
  { value: 1, key: 'petMenuSizeMedium' },
  { value: 1.4, key: 'petMenuSizeLarge' },
]

/** 菜单宽度（px）：贴边修正按它算。 */
const MENU_WIDTH = 210

/** 菜单估算高度（px）：决定开在上方还是下方。 */
const MENU_HEIGHT = 150

/** 正在飞的小心心。 */
interface Heart {
  /** 唯一标识（用于移除）。 */
  readonly id: number
  /** 相对宠物的横向偏移（px）。 */
  readonly dx: number
  /** 相对宠物的纵向偏移（px）。 */
  readonly dy: number
  /** 延迟（ms），让心心错落着冒出来。 */
  readonly delay: number
}

/** 拖拽进行中的内部状态。 */
interface DragState {
  /** 指针身份。 */
  pointerId: number
  /** 指针相对宠物左上角的偏移。 */
  offsetX: number
  offsetY: number
  /** 按下时的指针坐标。 */
  startX: number
  startY: number
  /** 上一帧的指针坐标（算速度用）。 */
  lastX: number
  lastY: number
  /** 上一帧的时间戳。 */
  lastAt: number
  /** 是否已越过拖拽阈值。 */
  moved: boolean
  /** 当前落位。 */
  x: number
  y: number
}

/**
 * 把坐标夹紧在视口内。
 * @param value - 原始坐标。
 * @param max - 该轴的可���上界。
 * @returns 夹紧后的坐标。
 */
function clampCoord(value: number, max: number): number {
  return Math.min(Math.max(value, EDGE_MARGIN), Math.max(EDGE_MARGIN, max - EDGE_MARGIN))
}

/** 落位时离视口边缘的留白（px）。 */
const EDGE_MARGIN = 8

/**
 * 桌宠组件。
 * @param props - `shell.overlay` 槽位的运行时 props（含根作用域标准席位）。
 * @returns 桌宠节点；桌宠关闭时返回 `null`。
 */
export function PetRoot(props: PropsRuntime<'shell.overlay'>): React.ReactElement | null {
  const { useSessionStatus } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const motionRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const heartIdRef = useRef(0)
  const impulseRef = useRef<{ start: number; frame: number }>({ start: 0, frame: 0 })
  const timersRef = useRef<number[]>([])
  const lastPokeAtRef = useRef<number | null>(null)
  const pressTimerRef = useRef(0)
  const patFiredRef = useRef(false)
  const spinSeqRef = useRef(0)
  const patSeqRef = useRef(0)
  const prevStateRef = useRef<PetState>('resting')
  const pointerLastMoveRef = useRef(0)

  const [prefs, setPrefs] = useState<RainbowPrefs>(loadPrefs)
  const [notice, setNotice] = useState<PetNotice | null>(null)
  const [petState, setPetState] = useState<PetState>('resting')
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [bubbleUntil, setBubbleUntil] = useState(0)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(() => readCurrentSessionId())
  const [remoteHealthy, setRemoteHealthy] = useState(false)
  const [stateSeq, setStateSeq] = useState(0)
  const [pokeSeq, setPokeSeq] = useState(0)
  const [poking, setPoking] = useState(false)
  const [hearts, setHearts] = useState<readonly Heart[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [flash, setFlash] = useState<{ key: RainbowKey; until: number } | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [dizzy, setDizzy] = useState(false)
  const [patting, setPatting] = useState(false)
  const [stumbling, setStumbling] = useState(false)
  const [stretching, setStretching] = useState(false)

  /** 延迟任务：登记进 timersRef，组件卸载时统一清掉（反应动画不会拖着僵尸定时器）。 */
  const later = useCallback((fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => () => {
    for (const id of timersRef.current) window.clearTimeout(id)
    if (pressTimerRef.current !== 0) window.clearTimeout(pressTimerRef.current)
  }, [])

  /** 一次性台词：优先级高于状态台词，展示 FLASH_MS 后让位。 */
  const showFlash = useCallback((key: RainbowKey, ms: number = FLASH_MS): void => {
    setFlash({ key, until: Date.now() + ms })
    later(() => { setFlash(null) }, ms)
  }, [later])

  // 语言切换：订阅宿主 locale 的版本号，变了就重渲染。
  useSyncExternalStore(subscribePetLocale, getPetLocaleRevision, getPetLocaleRevision)

  // 偏好变更：设置面板写完偏好会广播，桌宠据此更新位置与尺寸。
  useEffect(() => {
    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<RainbowPrefs>).detail
      if (detail) setPrefs(detail)
    }
    window.addEventListener(PREFS_EVENT, onPrefs)
    return () => { window.removeEventListener(PREFS_EVENT, onPrefs) }
  }, [])

  // 当前会话身份：会话作用域的状态桥发布，桌宠据此支持「只看当前会话」。
  useEffect(() => {
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail
      setCurrentSessionId(detail)
    }
    window.addEventListener(SESSION_EVENT, onSession)
    return () => { window.removeEventListener(SESSION_EVENT, onSession) }
  }, [])

  // 权威回合边界 → 一次性提示。
  useEffect(() => subscribeFrames((frame) => {
    if (frame.type !== 'turn/end') return
    const kind = noticeFromReason(frame.reason)
    if (kind === null) return
    setNotice({ kind, at: Date.now() })
  }), [])

  // 远端断开时，权威事件就不作数了——宁可少报喜，不报假喜。
  useEffect(() => subscribeHealth((healthy) => {
    setRemoteHealthy(healthy)
    if (!healthy) setNotice(null)
  }), [])

  // 视线分两路：
  // - 指针在动 → 瞳孔跟着指针走（rAF 节流 + 直接写 CSS 变量，不触发重渲染）；
  // - 指针静止超过 LOOK_IDLE_MS → 瞳孔开始「闲逛扫视」：随机瞟一眼、
  //   停一会儿、目光回中。看似自主的小动作是「活着感」的最大来源，
  //   比任何循环动画都管用。指针一动立即交还控制权。
  useEffect(() => {
    let frame = 0
    let pending: { x: number; y: number } | null = null
    let lastMoveAt = performance.now()
    let wanderTimer = 0
    let recoverTimer = 0

    const writeLook = (x: number, y: number): void => {
      const element = rootRef.current
      if (!element) return
      element.style.setProperty('--pet-look-x', `${x.toFixed(2)}px`)
      element.style.setProperty('--pet-look-y', `${y.toFixed(2)}px`)
    }
    const clearWander = (): void => {
      if (wanderTimer !== 0) {
        window.clearTimeout(wanderTimer)
        wanderTimer = 0
      }
      if (recoverTimer !== 0) {
        window.clearTimeout(recoverTimer)
        recoverTimer = 0
      }
    }
    const apply = (): void => {
      frame = 0
      const element = rootRef.current
      if (!element || pending === null) return
      const rect = element.getBoundingClientRect()
      const look = lookVector(
        pending.x - (rect.left + rect.width / 2),
        pending.y - (rect.top + rect.height / 2),
        LOOK_MAX,
      )
      writeLook(look.x, look.y)
    }
    const wander = (): void => {
      wanderTimer = 0
      const target = wanderGaze()
      writeLook(target.x, target.y)
      recoverTimer = window.setTimeout(() => {
        recoverTimer = 0
        writeLook(0, 0)
      }, WANDER_RECOVER_MS)
    }
    const onMove = (event: PointerEvent): void => {
      lastMoveAt = performance.now()
      pointerLastMoveRef.current = performance.now()
      clearWander()
      pending = { x: event.clientX, y: event.clientY }
      if (frame === 0) frame = requestAnimationFrame(apply)
    }
    // 低频巡检：指针闲置（或从未动过）就安排一次随机延迟的扫视；
    // 延迟本身随机化——固定周期扫视像钟表，随机才像自己的主意。
    const idleCheck = window.setInterval(() => {
      if (performance.now() - lastMoveAt < LOOK_IDLE_MS) return
      if (wanderTimer !== 0 || recoverTimer !== 0) return
      wanderTimer = window.setTimeout(wander, wanderDelay())
    }, 800)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.clearInterval(idleCheck)
      clearWander()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  const statuses = useSessionStatus((map) => map)

  const activity = useMemo(
    () => scopeActivity(statuses, currentSessionId, prefs.petScope),
    [statuses, currentSessionId, prefs.petScope],
  )

  // 状态推导：定时重算，让一次性提示自然过期、让空闲自然进入打盹。
  // 从打盹醒来时补一个伸懒腰——睡与醒之间要有过渡，不能「啪」地切换。
  useEffect(() => {
    const tick = (): void => {
      const now = Date.now()
      if (activity.running || activity.waiting) lastActivityRef.current = now
      const next = derivePetState({
        running: activity.running,
        waiting: activity.waiting,
        notice,
        lastActivityAt: lastActivityRef.current,
      }, now)
      const prev = prevStateRef.current
      prevStateRef.current = next
      if (prev === 'sleeping' && next !== 'sleeping') {
        setStretching(true)
        showFlash('petWake')
        later(() => { setStretching(false) }, STRETCH_MS)
      }
      setPetState((current) => (current === next ? current : next))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => { window.clearInterval(timer) }
  }, [activity.running, activity.waiting, notice, later, showFlash])

  // 环境感知：窗口被拖拽/分屏改变大小 → 地板在动，踉跄一下。
  // 拖动窗口把手会连发 resize，防抖只认停稳的那一下；拖拽宠物中不触发。
  useEffect(() => {
    if (!prefs.petEnabled || prefs.petMotion === 'off') return
    let debounce = 0
    const onResize = (): void => {
      if (debounce !== 0) window.clearTimeout(debounce)
      debounce = window.setTimeout(() => {
        debounce = 0
        if (dragRef.current !== null) return
        setStumbling(true)
        showFlash('petStumble')
        later(() => { setStumbling(false) }, STUMBLE_MS)
      }, STUMBLE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (debounce !== 0) window.clearTimeout(debounce)
    }
  }, [prefs.petEnabled, prefs.petMotion, later, showFlash])

  // 环境感知：有人在滚聊天记录 → 目光跟着内容走一点。
  // 只在指针闲着时才多管闲事（指针在动就只跟指针）；高频滚动要节流，
  // 小步滚动不值得看一眼。这是「住在窗口里」而不是「贴在窗口上」的分野。
  useEffect(() => {
    if (prefs.petMotion === 'off') return
    const lastY = new WeakMap<Element, number>()
    let lastAt = 0
    let recover = 0
    const onScroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (performance.now() - pointerLastMoveRef.current < SCROLL_GAZE_POINTER_IDLE_MS) return
      if (dragRef.current !== null) return
      const now = performance.now()
      const prev = lastY.get(target)
      lastY.set(target, target.scrollTop)
      if (prev === undefined || Math.abs(target.scrollTop - prev) < SCROLL_GAZE_MIN_DELTA) return
      if (now - lastAt < SCROLL_GAZE_INTERVAL_MS) return
      lastAt = now
      const element = rootRef.current
      if (element === null) return
      // 向下滚 = 新内容从下面来，目光向下瞟一点；向上滚反之。
      element.style.setProperty('--pet-look-y', `${(target.scrollTop > prev ? 1.8 : -1.8).toFixed(2)}px`)
      if (recover !== 0) window.clearTimeout(recover)
      recover = window.setTimeout(() => {
        recover = 0
        rootRef.current?.style.setProperty('--pet-look-y', '0px')
      }, WANDER_RECOVER_MS)
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (recover !== 0) window.clearTimeout(recover)
    }
  }, [prefs.petMotion])

  // 状态变了就换一句台词（同一状态内不换，免得闪）。
  useEffect(() => { setStateSeq((n) => n + 1) }, [petState])

  // 落位：优先用记住的位置；没有记录过就用右下角默认位。
  // 记住的位置也要夹回当前视口——在大屏上摆的宠物，换到小屏不能跑到屏幕外找不着。
  const size = Math.round(PET_BASE_SIZE * prefs.petScale)
  useEffect(() => {
    if (position !== null) return
    const fallbackX = window.innerWidth - size - 24
    const fallbackY = window.innerHeight - size - 24
    setPosition({
      x: clampCoord(prefs.petX ?? fallbackX, window.innerWidth),
      y: clampCoord(prefs.petY ?? fallbackY, window.innerHeight),
    })
  }, [position, size, prefs.petX, prefs.petY])

  // 贴边修正：气泡和菜单都以宠物为中心，宠物靠边时会被裁掉。
  // 这里把整体往里推——推的量取自最宽的菜单，两边就不会错位。
  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const half = MENU_WIDTH / 2
    const clamped = Math.min(Math.max(center, EDGE_MARGIN + half), window.innerWidth - EDGE_MARGIN - half)
    element.style.setProperty('--pet-edge-shift', `${(clamped - center).toFixed(1)}px`)
  }, [position, size])

  // 菜单开在上方还是下方：顶部空间不够就翻到下面。
  const [menuBelow, setMenuBelow] = useState(false)
  const toggleMenu = useCallback(() => {
    const element = rootRef.current
    if (element) {
      const rect = element.getBoundingClientRect()
      setMenuBelow(rect.top < MENU_HEIGHT + EDGE_MARGIN * 2)
    }
    setMenuOpen((open) => !open)
  }, [])

  /** 播放一次挤压回弹（直接写 transform，不惊动 React）。 */
  const runSquash = useCallback(() => {
    const element = motionRef.current
    if (!element) return
    const state = impulseRef.current
    state.start = performance.now()
    if (state.frame !== 0) return
    const step = (): void => {
      const t = (performance.now() - state.start) / SQUASH_MS
      if (t >= 1) {
        state.frame = 0
        element.style.transform = ''
        return
      }
      const ratio = 1 + 0.18 * Math.sin(Math.PI * t) * (1 - t)
      element.style.transform = `scale(${(1 + 0.16 * ratio).toFixed(3)}, ${(1 - 0.18 * ratio).toFixed(3)})`
      state.frame = requestAnimationFrame(step)
    }
    state.frame = requestAnimationFrame(step)
  }, [])

  /** 炸开几颗小心心。 */
  const spawnHearts = useCallback(() => {
    const count = 3 + Math.floor(Math.random() * 3)
    const items: Heart[] = Array.from({ length: count }, () => ({
      id: heartIdRef.current++,
      dx: (Math.random() - 0.5) * 58,
      dy: -12 - Math.random() * 28,
      delay: Math.random() * 170,
    }))
    setHearts((current) => [...current, ...items])
    window.setTimeout(() => {
      setHearts((current) => current.filter((heart) => !items.some((item) => item.id === heart.id)))
    }, 1500)
  }, [])

  /** 连戳转圈：转完还晕一小会儿（×_×）。 */
  const startSpin = useCallback((): void => {
    spinSeqRef.current += 1
    setSpinning(true)
    showFlash(pickKey(SPIN_LINES, spinSeqRef.current), SPIN_MS + DIZZY_MS + 400)
    if (prefs.petMotion !== 'off') spawnHearts()
    later(() => {
      setSpinning(false)
      setDizzy(true)
    }, SPIN_MS)
    later(() => { setDizzy(false) }, SPIN_MS + DIZZY_MS)
  }, [later, prefs.petMotion, showFlash, spawnHearts])

  /** 长按摸摸：果冻鼓起 + 大腮红 + 心心。 */
  const firePat = useCallback((): void => {
    patSeqRef.current += 1
    setPatting(true)
    setBubbleUntil(Date.now() + PAT_MS + 200)
    showFlash(pickKey(PAT_LINES, patSeqRef.current))
    if (prefs.petMotion !== 'off') spawnHearts()
    later(() => { setPatting(false) }, PAT_MS)
  }, [later, prefs.petMotion, showFlash, spawnHearts])

  /** 戳一下：挤压 + 换台词 + 冒心心；连戳（双击）升级成转圈。 */
  const onPoke = useCallback(() => {
    const now = Date.now()
    const rapid = isRapidPoke(lastPokeAtRef.current, now)
    lastPokeAtRef.current = now
    if (rapid) {
      startSpin()
      return
    }
    setPokeSeq((n) => n + 1)
    setPoking(true)
    setBubbleUntil(Date.now() + POKE_MS)
    runSquash()
    spawnHearts()
  }, [runSquash, spawnHearts, startSpin])

  useEffect(() => {
    if (!poking) return
    const timer = window.setTimeout(() => { setPoking(false) }, POKE_MS)
    return () => { window.clearTimeout(timer) }
  }, [poking])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // 菜单里的按下**不能**被当成拖拽起点：一旦在这里抓了指针，
    // pointerup 就被宠物吃掉，菜单项永远等不到 click（浏览器只把 click
    // 派发到按下/抬起两点的最近公共祖先）。
    if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
    const element = rootRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: performance.now(),
      moved: false,
      x: rect.left,
      y: rect.top,
    }
    element.setPointerCapture(event.pointerId)
    setDragging(true)
    // 开始拖拽 = 收起菜单（菜单和拖拽不能同时在场）。
    setMenuOpen(false)
    // 长按计时：按住不动满 LONG_PRESS_MS 就是「摸摸」；中途拖动立即取消，
    // 抬起时也不再把这次按住当成戳（摸已经发生过了）。
    patFiredRef.current = false
    if (pressTimerRef.current !== 0) window.clearTimeout(pressTimerRef.current)
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = 0
      if (dragRef.current?.moved) return
      patFiredRef.current = true
      firePat()
    }, LONG_PRESS_MS)
  }, [firePat])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const element = rootRef.current
    const motion = motionRef.current
    if (!drag || !element || drag.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
      // 拖动成立：长按作废。
      if (!drag.moved && pressTimerRef.current !== 0) {
        window.clearTimeout(pressTimerRef.current)
        pressTimerRef.current = 0
      }
      drag.moved = true
    }
    const x = clampCoord(event.clientX - drag.offsetX, window.innerWidth)
    const y = clampCoord(event.clientY - drag.offsetY, window.innerHeight)
    drag.x = x
    drag.y = y
    // 拖拽中直接改样式，避免每帧重渲染整棵树。
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    if (motion !== null) {
      // 顺着惯性歪一下：角度由水平速度算出，像被吊在指尖。
      const now = performance.now()
      const dt = Math.max(1, now - drag.lastAt)
      const velocity = (event.clientX - drag.lastX) / dt
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      drag.lastAt = now
      const angle = swingAngle(velocity, 14)
      motion.style.transform = `rotate(${angle.toFixed(2)}deg) translateY(3px)`
    }
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const element = rootRef.current
    const motion = motionRef.current
    if (pressTimerRef.current !== 0) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = 0
    }
    dragRef.current = null
    setDragging(false)
    if (!drag || !element) return
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    if (motion !== null) motion.style.transform = ''
    if (!drag.moved) {
      // 长按已经把这次按住消费成「摸摸」，抬起不再补一刀戳。
      if (patFiredRef.current) {
        patFiredRef.current = false
        return
      }
      onPoke()
      return
    }
    setPosition({ x: drag.x, y: drag.y })
    savePrefs({ ...prefs, petX: drag.x, petY: drag.y })
  }, [onPoke, prefs])

  // 菜单：点外面或按 Esc 关闭。
  // 注意：必须忽略菜单**内部**的 pointerdown——否则菜单会先被关掉，
  // 菜单项的 click 永远等不到（点外部与点菜单项在事件顺序上无法区分）。
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent): void => {
      const menu = menuRef.current
      if (menu !== null && event.target instanceof Node && menu.contains(event.target)) return
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  /** 改一个偏好并立刻落盘（菜单里用）。 */
  const patchPrefs = useCallback((patch: Partial<RainbowPrefs>): void => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(next)
  }, [prefs])

  if (!prefs.petEnabled) return null

  // 台词优先级：拖拽 > 一次性反应（转圈/摸摸/踉跄/伸懒腰）> 戳 > 常驻状态。
  const flashActive = flash !== null && Date.now() < flash.until
  const bubbleKey: RainbowKey = dragging
    ? 'petDrag'
    : flashActive && flash !== null
      ? flash.key
      : poking
        ? pickKey(POKE_LINES, pokeSeq)
        : pickKey(STATE_LINES[petState], stateSeq)
  const showBubble = flashActive || hovered || Date.now() < bubbleUntil || petState === 'waiting' || petState === 'error'

  return (
    <div
      ref={rootRef}
      className={styles.pet}
      data-state={petState}
      data-dragging={dragging ? 'true' : 'false'}
      data-remote={remoteHealthy ? 'connected' : 'offline'}
      data-motion={prefs.petMotion}
      data-spin={spinning ? 'true' : undefined}
      data-dizzy={dizzy ? 'true' : undefined}
      data-pat={patting ? 'true' : undefined}
      data-stumble={stumbling ? 'true' : undefined}
      data-stretch={stretching ? 'true' : undefined}
      style={{
        left: position?.x ?? undefined,
        top: position?.y ?? undefined,
        width: size,
        height: size,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      onContextMenu={(event) => { event.preventDefault(); toggleMenu() }}
    >
      <span className={styles.aura} aria-hidden="true" />
      {/* 读屏播报只在「等你 / 出错」这两种需要用户行动的状态开启——
          闲聊台词播出来只会是噪声。 */}
      <span
        className={styles.bubble}
        role="status"
        aria-live={petState === 'waiting' || petState === 'error' ? 'polite' : 'off'}
        data-visible={showBubble ? 'true' : 'false'}
      >
        {translatePet(bubbleKey)}
      </span>

      <button
        type="button"
        className={styles.hit}
        aria-label={translatePet('petName')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onKeyDown={(event) => {
          // 菜单也要能纯键盘打开（ContextMenu 键 / Shift+F10）——
          // 右键可达的功能，键盘也该可达。
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            toggleMenu()
          }
        }}
      >
        <span className={styles.motion} ref={motionRef}>
          <span className={styles.body}>
            <span className={styles.sheen} />
            <span className={styles.face}>
              <span className={styles.eyeLeft}><span className={styles.pupil} /><span className={styles.glint} /><span className={styles.glintDot} /><span className={styles.dizzyX} aria-hidden="true" /></span>
              <span className={styles.eyeRight}><span className={styles.pupil} /><span className={styles.glint} /><span className={styles.glintDot} /><span className={styles.dizzyX} aria-hidden="true" /></span>
              <span className={styles.browLeft} />
              <span className={styles.browRight} />
              <span className={styles.blushLeft} />
              <span className={styles.blushRight} />
              <span className={styles.mouth}><span className={styles.tongue} /></span>
            </span>
          </span>
          {/* 轮廓与呆毛画在身体之上：描边完整可见，呆毛根部压在头顶。 */}
          <svg className={styles.dropShape} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={DROP_CLIP_ID} clipPathUnits="objectBoundingBox">
                <path d={DROP_PATH_BB} />
              </clipPath>
              <linearGradient id="rainbowspeak-tip" x1="0.7" y1="0" x2="0.3" y2="1">
                <stop offset="0" stopColor="#ffd9d9" />
                <stop offset="0.48" stopColor="#ff9c9c" />
                <stop offset="1" stopColor="#ff6b6b" />
              </linearGradient>
              <linearGradient id="rainbowspeak-tip-amber" x1="0.7" y1="0" x2="0.3" y2="1">
                <stop offset="0" stopColor="#fef3c7" />
                <stop offset="0.48" stopColor="#fcd34d" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="rainbowspeak-tip-red" x1="0.7" y1="0" x2="0.3" y2="1">
                <stop offset="0" stopColor="#fee2e2" />
                <stop offset="0.48" stopColor="#fca5a5" />
                <stop offset="1" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <path className={styles.tipFill} d={TIP_PATH} vectorEffect="non-scaling-stroke" />
            <path className={styles.dropEdge} d={DROP_PATH} vectorEffect="non-scaling-stroke" />
            <path className={styles.dropEdgeInner} d={DROP_PATH} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className={styles.sweat} aria-hidden="true" />
        </span>
        <span className={styles.shock} key={pokeSeq} aria-hidden="true" />
        <span className={styles.sparkles} aria-hidden="true">
          <span className={styles.sparkle}>✦</span>
          <span className={styles.sparkle}>✧</span>
          <span className={styles.sparkle}>✦</span>
        </span>
        <span className={styles.zzz} aria-hidden="true">z z</span>
        {hearts.map((heart) => (
          <span
            key={heart.id}
            className={styles.heart}
            style={{ left: `${50 + heart.dx / 2}%`, top: `${52 + heart.dy}%`, animationDelay: `${heart.delay}ms` }}
            aria-hidden="true"
          >
            ♥
          </span>
        ))}
      </button>
      <span className={styles.shadow} aria-hidden="true" />

      {menuOpen && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={translatePet('petMenu')}
          data-below={menuBelow ? 'true' : 'false'}
        >
          <div className={styles.menuRow}>
            <span className={styles.menuLabel}>{translatePet('petMenuScope')}</span>
            <div className={styles.menuChips}>
              {(['all', 'current'] as PetScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  role="menuitemradio"
                  aria-checked={prefs.petScope === scope}
                  className={prefs.petScope === scope ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  onClick={() => { patchPrefs({ petScope: scope }); setMenuOpen(false) }}
                >
                  {translatePet(scope === 'all' ? 'petMenuScopeAll' : 'petMenuScopeCurrent')}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.menuRow}>
            <span className={styles.menuLabel}>{translatePet('petMenuSize')}</span>
            <div className={styles.menuChips}>
              {SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={prefs.petScale === option.value}
                  className={prefs.petScale === option.value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  onClick={() => { patchPrefs({ petScale: option.value }); setMenuOpen(false) }}
                >
                  {translatePet(option.key)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => { patchPrefs({ petEnabled: false }); setMenuOpen(false) }}
          >
            {translatePet('petMenuHide')}
          </button>
        </div>
      )}
    </div>
  )
}
