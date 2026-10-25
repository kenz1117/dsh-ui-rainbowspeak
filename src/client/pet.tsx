/**
 * 桌宠「小虹」组件：挂在 `shell.overlay`（根作用域的浮动层）上。
 *
 * 它同时吃两路信号：
 * - 宿主回合边界流（经 Typert 远端）→ 决定「这轮到底怎么了」；
 * - 客户端会话状态（`useSessionStatus` 标准席位）→ 决定「现在谁在跑」。
 *
 * 互动是这一版的主菜：
 * - **眼睛跟着指针走**（纯 CSS 变量驱动，不触发重渲染）；
 * - **戳一下**会挤压回弹、冒出台词、炸开小心心；
 * - **拖着走**时它顺着惯性歪，像被吊在指尖；
 * - **右键**弹出小菜单：关注范围 / 大小 / 让它躲起来。
 *
 * 形象是纯 CSS 几何，没有任何外部素材——因此没有第三方形象的授权问题。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/pet
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './pet.module.css'
import { derivePetState, noticeFromReason, readCurrentSessionId, scopeActivity, SESSION_EVENT, type PetNotice, type PetState } from './pet-state.ts'
import { lookVector, pickKey, POKE_LINES, STATE_LINES, swingAngle } from './pet-motion.ts'
import { subscribeFrames, subscribeHealth } from './pet-store.ts'
import { getPetLocaleRevision, subscribePetLocale, translatePet } from './pet-locale.ts'
import { PREFS_EVENT, loadPrefs, savePrefs, PET_BASE_SIZE, type RainbowPrefs } from './preferences.ts'
import type { RainbowKey } from './locales.ts'
import type { PetScope } from './pet-state.ts'

/** 瞳孔最大偏移（px）：眼睛挪一点，不挪出眼眶。 */
const LOOK_MAX = 4.5

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

  // 视线跟随：指针在哪，瞳孔就往哪挪一点。
  // 走 rAF 节流 + 直接写 CSS 变量，不触发 React 重渲染。
  useEffect(() => {
    let frame = 0
    let pending: { x: number; y: number } | null = null
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
      element.style.setProperty('--pet-look-x', `${look.x.toFixed(2)}px`)
      element.style.setProperty('--pet-look-y', `${look.y.toFixed(2)}px`)
    }
    const onMove = (event: PointerEvent): void => {
      pending = { x: event.clientX, y: event.clientY }
      if (frame === 0) frame = requestAnimationFrame(apply)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  const statuses = useSessionStatus((map) => map)

  const activity = useMemo(
    () => scopeActivity(statuses, currentSessionId, prefs.petScope),
    [statuses, currentSessionId, prefs.petScope],
  )

  // 状态推导：定时重算，让一次性提示自然过期、让空闲自然进入打盹。
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
      setPetState((current) => (current === next ? current : next))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => { window.clearInterval(timer) }
  }, [activity.running, activity.waiting, notice])

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

  /** 戳一下：挤压 + 换台词 + 冒心心。 */
  const onPoke = useCallback(() => {
    setPokeSeq((n) => n + 1)
    setPoking(true)
    setBubbleUntil(Date.now() + POKE_MS)
    runSquash()
    spawnHearts()
  }, [runSquash, spawnHearts])

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
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const element = rootRef.current
    const motion = motionRef.current
    if (!drag || !element || drag.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true
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
    dragRef.current = null
    setDragging(false)
    if (!drag || !element) return
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    if (motion !== null) motion.style.transform = ''
    if (!drag.moved) {
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

  const bubbleKey: RainbowKey = dragging
    ? 'petDrag'
    : poking
      ? pickKey(POKE_LINES, pokeSeq)
      : pickKey(STATE_LINES[petState], stateSeq)
  const showBubble = hovered || Date.now() < bubbleUntil || petState === 'waiting' || petState === 'error'

  return (
    <div
      ref={rootRef}
      className={styles.pet}
      data-state={petState}
      data-dragging={dragging ? 'true' : 'false'}
      data-remote={remoteHealthy ? 'connected' : 'offline'}
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
      <span className={styles.bubble} data-visible={showBubble ? 'true' : 'false'}>
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
            <span className={styles.rim} />
            <span className={styles.face}>
              <span className={styles.eyeLeft}><span className={styles.pupil} /><span className={styles.glint} /></span>
              <span className={styles.eyeRight}><span className={styles.pupil} /><span className={styles.glint} /></span>
              <span className={styles.browLeft} />
              <span className={styles.browRight} />
              <span className={styles.blushLeft} />
              <span className={styles.blushRight} />
              <span className={styles.mouth} />
            </span>
          </span>
        </span>
        <span className={styles.shock} key={pokeSeq} aria-hidden="true" />
        <span className={styles.sparkles} aria-hidden="true">
          <span className={styles.sparkle}>✦</span>
          <span className={styles.sparkle}>✧</span>
          <span className={styles.sparkle}>✦</span>
        </span>
        <span className={styles.sweat} aria-hidden="true" />
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
