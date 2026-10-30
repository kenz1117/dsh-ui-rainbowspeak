/**
 * 实测台运行时 v2：支持三种开关，便于同机对照。
 *   ?look=var|direct   瞳孔跟随：写 CSS 变量（现状）/ 直接写 transform（优化）
 *   ?rainbow=angle|transform  跑马灯：@property 角度插值（现状）/ 旋转图层（优化）
 *   ?motion=off        关掉桌宠全部 CSS 动画（隔离动画引起的样式重算）
 *
 * 热路径（瞳孔跟随的 rAF + 写入、挤压回弹的 rAF + transform 写入）复刻自
 * src/client/pet.tsx，常量与算法一致。
 */
const params = new URLSearchParams(location.search)
const LOOK_MODE = params.get('look') ?? 'direct'
const RAINBOW_MODE = params.get('rainbow') ?? 'angle'
/** ?ref=1：切到冻结的「改造前」样式（reference/pet.module.css + reference 跑马灯）。 */
const USE_REFERENCE = params.get('ref') === '1'

if (USE_REFERENCE) {
  for (const [id, on] of [['css-pet', false], ['css-pet-ref', true], ['css-rainbow', false], ['css-rainbow-ref', true]]) {
    const el = document.getElementById(id)
    if (el) el.disabled = !on
  }
}

const LOOK_MAX = 5.5
const LOOK_IDLE_MS = 3000
const WANDER_RECOVER_MS = 1500
const SQUASH_MS = 420

const root = document.querySelector('.pet')
const motion = document.querySelector('.motion')
const pupils = [...document.querySelectorAll('.pupil, .glint, .glintDot')]

function lookVector(dx, dy, max) {
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { x: 0, y: 0 }
  const scale = Math.min(1, max / distance)
  return { x: dx * scale, y: dy * scale }
}
function wanderGaze(random = Math.random, max = 3.2) {
  const angle = random() * Math.PI * 2
  const radius = random() * max
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}
function wanderDelay(random = Math.random) { return 2400 + random() * 3200 }

/* ——— 瞳孔跟随 ——— */
let frame = 0
let pending = null
let lastMoveAt = performance.now()
let wanderTimer = 0
let recoverTimer = 0

function writeLook(x, y) {
  if (LOOK_MODE === 'direct') {
    // 优化：只写需要动的三个元素的 transform，不碰继承型自定义属性。
    for (const el of pupils) el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`
    return
  }
  root.style.setProperty('--pet-look-x', `${x.toFixed(2)}px`)
  root.style.setProperty('--pet-look-y', `${y.toFixed(2)}px`)
}
function clearWander() {
  if (wanderTimer !== 0) { clearTimeout(wanderTimer); wanderTimer = 0 }
  if (recoverTimer !== 0) { clearTimeout(recoverTimer); recoverTimer = 0 }
}
function apply() {
  frame = 0
  if (!root || pending === null) return
  const rect = root.getBoundingClientRect()
  const look = lookVector(pending.x - (rect.left + rect.width / 2), pending.y - (rect.top + rect.height / 2), LOOK_MAX)
  writeLook(look.x, look.y)
}
function wander() {
  wanderTimer = 0
  const t = wanderGaze()
  writeLook(t.x, t.y)
  recoverTimer = setTimeout(() => { recoverTimer = 0; writeLook(0, 0) }, WANDER_RECOVER_MS)
}
function onMove(event) {
  lastMoveAt = performance.now()
  clearWander()
  pending = { x: event.clientX, y: event.clientY }
  if (frame === 0) frame = requestAnimationFrame(apply)
}
window.addEventListener('pointermove', onMove, { passive: true })
const idleCheck = setInterval(() => {
  if (performance.now() - lastMoveAt < LOOK_IDLE_MS) return
  if (wanderTimer !== 0 || recoverTimer !== 0) return
  wanderTimer = setTimeout(wander, wanderDelay())
}, 800)

/* ——— 挤压回弹 ——— */
const impulse = { start: 0, frame: 0 }
function runSquash() {
  impulse.start = performance.now()
  if (impulse.frame !== 0) return
  const step = () => {
    const t = (performance.now() - impulse.start) / SQUASH_MS
    if (t >= 1) { impulse.frame = 0; motion.style.transform = ''; return }
    const ratio = 1 + 0.18 * Math.sin(Math.PI * t) * (1 - t)
    motion.style.transform = `scale(${(1 + 0.16 * ratio).toFixed(3)}, ${(1 - 0.18 * ratio).toFixed(3)})`
    impulse.frame = requestAnimationFrame(step)
  }
  impulse.frame = requestAnimationFrame(step)
}

/* ——— 拖拽摆动 ——— */
let drag = null
const hit = document.querySelector('.hit')
hit.addEventListener('pointerdown', (e) => {
  const rect = root.getBoundingClientRect()
  drag = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, lastX: e.clientX, lastAt: performance.now() }
  root.setPointerCapture(e.pointerId)
  root.setAttribute('data-dragging', 'true')
})
hit.addEventListener('pointermove', (e) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  root.style.left = `${e.clientX - drag.offsetX}px`
  root.style.top = `${e.clientY - drag.offsetY}px`
  const now = performance.now()
  const dt = Math.max(1, now - drag.lastAt)
  const velocity = (e.clientX - drag.lastX) / dt
  drag.lastX = e.clientX; drag.lastAt = now
  const angle = Math.min(14, Math.max(-14, velocity * 900))
  motion.style.transform = `rotate(${angle.toFixed(2)}deg) translateY(3px)`
})
hit.addEventListener('pointerup', () => { drag = null; root.removeAttribute('data-dragging'); motion.style.transform = '' })

/* ——— 桌宠变体：几何过渡 → 合成属性 ——— */
if (params.get('pet') === 'no-geo') {
  document.documentElement.dataset.rsPet = 'no-geo'
}

/* ——— 跑马灯 ———
   实时样式自带旋转图层（产品实现），所以这里要复刻它的 DOM 注入：
   载体层 .rs-ring 管遮罩，色彩层 .rs-conic 自转。
   基准样式（改造前）没有图层，靠 ::before 的角度插值流动。 */
function injectRing() {
  const card = document.querySelector('[data-composer-card]')
  if (card === null || card.querySelector(':scope > .rs-ring') !== null) return
  const ring = document.createElement('div')
  ring.className = 'rs-ring'
  const conic = document.createElement('div')
  conic.className = 'rs-conic'
  ring.appendChild(conic)
  card.appendChild(ring)
  card.classList.add('rs-has-ring')
}

if (RAINBOW_MODE === 'hue') {
  document.documentElement.dataset.rsMode = 'hue'
}
if (RAINBOW_MODE === 'transform') {
  document.documentElement.dataset.rsMode = 'transform'
}
if (!USE_REFERENCE) injectRing()

/* ——— 帧计时 ——— */
const frameLog = []
let recording = false
function tick(ts) { if (recording) frameLog.push(ts); requestAnimationFrame(tick) }
requestAnimationFrame(tick)

window.__bench = {
  mode: { look: LOOK_MODE, rainbow: RAINBOW_MODE },
  record(on) { if (on) frameLog.length = 0; recording = on },
  frames() {
    const gaps = []
    for (let i = 1; i < frameLog.length; i++) gaps.push(frameLog[i] - frameLog[i - 1])
    gaps.sort((a, b) => a - b)
    const sum = gaps.reduce((a, b) => a + b, 0)
    return {
      count: gaps.length,
      mean: gaps.length ? +(sum / gaps.length).toFixed(2) : 0,
      p95: gaps.length ? +gaps[Math.floor(gaps.length * 0.95)].toFixed(2) : 0,
      max: gaps.length ? +gaps[gaps.length - 1].toFixed(2) : 0,
      over20: gaps.filter((g) => g > 20).length,
      over33: gaps.filter((g) => g > 33.4).length,
    }
  },
  setState(state) { root.setAttribute('data-state', state) },
  setBorder(on) {
    if (on) document.documentElement.removeAttribute('data-rainbow-off')
    else document.documentElement.setAttribute('data-rainbow-off', '1')
  },
  /** 逐个关掉桌宠的动画分支，用来定位「哪个动画逼出了每帧样式重算」。 */
  disable(part) {
    const map = {
      aura: '.aura', sheen: '.sheen', eyes: '.eyeLeft,.eyeRight',
      body: '.body', shadow: '.shadow', sparkles: '.sparkle', sweat: '.sweat', zzz: '.zzz',
    }
    const sel = map[part]
    if (!sel) return
    document.querySelectorAll(sel).forEach((el) => { el.style.animation = 'none' })
  },
  poke() { runSquash() },
}
