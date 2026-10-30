/**
 * 跑马灯的「旋转图层」接线：往宿主的输入框卡片里注入两层 DOM。
 *
 * 为什么不用 `@property` 角度插值：那样每帧都要重新光栅化整张卡片的锥形渐变
 * （实测 3 秒 362 次 Paint，裁剪区是整个视口），抢的是宿主自己的主线程。
 * 旋转图层把「流动」交给合成器——渐变只画一次，之后靠 `transform` 搬运。
 *
 * 分工：
 * - `.rs-ring`（载体）—— 只负责遮罩：把渐变挖成卡片边缘的一圈色带，
 *   形状永远不动；
 * - `.rs-conic`（色彩层）—— 一张正方形的锥形渐变，绕卡片中心自转。
 *
 * **图层必须是正方形**：扁矩形绕中心旋转时只盖得住中心附近的一个窄扇区，
 * 卡片左右会露出底层渐变（实测出现 130° 色相断层）。正方形的内切圆半径
 * = 边长/2 = 卡片宽度 ≥ 卡片对角线的一半，任何角度都盖得住。
 *
 * 注入时机：宿主卡片可能晚于插件挂载出现，也可能被 React 重绘换掉，
 * 所以用 MutationObserver 盯着，出现就补、换掉就重挂。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/client/rainbow-ring
 */

/** 宿主的输入框卡片锚点（ui-conversation InputBar 打的稳定标记）。 */
const CARD_SELECTOR = '[data-composer-card]'

/** 载体层类名：遮罩在这一层。 */
const RING_CLASS = 'rs-ring'

/** 色彩层类名：锥形渐变在这一层，自转。 */
const CONIC_CLASS = 'rs-conic'

/** 挂在「已有旋转图层」的卡片上：让静态兜底的 ::before 退场，避免两层色带叠加。 */
const HAS_RING_CLASS = 'rs-has-ring'

/** 宿主注入元素的归属标记（与样式表标签同一 id，便于排查与清理）。 */
const PLUGIN_ID = '@kenz1117/dsh-ui-rainbowspeak'

/**
 * 挂上旋转图层。
 *
 * 幂等：卡片已有图层就不重复注入；卡片被换掉则重挂到新卡片上。
 * @returns 卸载函数（移除注入的 DOM、断开观察）。
 */
export function mountRainbowRing(): () => void {
  const seen = new WeakSet<Element>()

  /** 给一张卡片装上旋转图层。 */
  const attach = (card: Element): void => {
    if (seen.has(card)) return
    seen.add(card)
    if (card.querySelector(`:scope > .${RING_CLASS}`) !== null) return
    const ring = document.createElement('div')
    ring.className = RING_CLASS
    ring.dataset.plugin = PLUGIN_ID
    const conic = document.createElement('div')
    conic.className = CONIC_CLASS
    ring.appendChild(conic)
    card.appendChild(ring)
    card.classList.add(HAS_RING_CLASS)
  }

  /** 扫一遍当前所有输入框卡片。 */
  const scan = (): void => {
    for (const card of document.querySelectorAll(CARD_SELECTOR)) attach(card)
  }

  // DOM 变动很频繁（宿主一帧能改几十处），用 rAF 把扫描合并成一帧一次。
  let pending = 0
  const schedule = (): void => {
    if (pending !== 0) return
    pending = requestAnimationFrame(() => {
      pending = 0
      scan()
    })
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  scan()

  return () => {
    observer.disconnect()
    if (pending !== 0) {
      cancelAnimationFrame(pending)
      pending = 0
    }
    for (const el of document.querySelectorAll(`.${RING_CLASS}`)) el.remove()
    for (const el of document.querySelectorAll(`.${HAS_RING_CLASS}`)) el.classList.remove(HAS_RING_CLASS)
  }
}
