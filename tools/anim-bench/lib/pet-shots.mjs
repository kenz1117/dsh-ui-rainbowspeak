/**
 * 桌宠视觉回归测试的公共件。
 *
 * 两个脚本（snapshot-pet.mjs / verify-pet-visual.mjs）共用同一套「起服务 → 起 Chrome
 * → 连 CDP → 逐状态截图 → 关进程」的流程，集中在这里是为了让「拍图」只有一份实现——
 * 拍图一旦有两份，参考图与比对图就有可能不是同一台机器、同一相位拍出来的，
 * 比对结果就成了假数字。
 *
 * 只用 Node 内置能力 + 全局 WebSocket，不引入任何新依赖。
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, extname, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** tools/anim-bench 目录。 */
export const BENCH_DIR = resolve(here, '..')
/** 实测台产物目录（build.mjs 的输出，静态服务以它为根）。 */
export const OUT_DIR = join(BENCH_DIR, '.out')

/** 桌宠的六种状态，顺序即截图与比对的顺序。 */
export const PET_STATES = ['resting', 'working', 'waiting', 'celebrating', 'error', 'sleeping']

/** 状态切换后必须等过渡动画跑完再拍：CSS 里的表情几何过渡是 0.32s，拍早了拿到的是中间帧。 */
export const STATE_SETTLE_MS = 700
/** 冻结动画后留的刷新余量：暂停只是改了时间轴，还要等合成器把这一帧刷出来。 */
export const FREEZE_SETTLE_MS = 150
/** 动画冻结到的固定相位（毫秒）。取 1s：既越过所有有限动画的时长，又是循环动画的一个确定相位。 */
export const FREEZE_MS = 1000
/** 通道差超过该值才算「这个像素不一样」。 */
export const DIFF_CHANNEL_THRESHOLD = 16

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 找一个当前空闲的本机端口：固定端口会跟并行跑的实测台撞车。 */
async function findFreePort() {
  const probe = createServer()
  await new Promise((r) => probe.listen(0, '127.0.0.1', r))
  const { port } = probe.address()
  await new Promise((r) => probe.close(r))
  return port
}

/**
 * 重新生成实测页。
 * 快照必须基于**最新的**真实样式：源码改了但没重建，参考图就会与线上表现脱节，
 * 后面所有的「一致」都是假的。
 * @returns {Promise<void>} build.mjs 成功退出后 resolve。
 */
export async function buildBenchPage() {
  await new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [join(BENCH_DIR, 'build.mjs')], { stdio: 'inherit' })
    child.on('error', rejectBuild)
    child.on('exit', (code) => (code === 0 ? resolveBuild() : rejectBuild(new Error(`build.mjs 退出码 ${code}`))))
  })
}

/**
 * 起一个只读本地文件的静态服务，供 headless Chrome 加载实测页。
 * @param {object} [options]
 * @param {string} [options.root] 站点根目录，默认 .out。
 * @returns {Promise<{url: string, close: () => Promise<void>}>} 服务句柄。
 */
export async function startStaticServer({ root = OUT_DIR } = {}) {
  const server = createServer(async (req, res) => {
    const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
    try {
      const body = await readFile(join(root, path))
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'text/plain' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('x')
    }
  })
  const port = await findFreePort()
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${port}/index.html`,
    async close() {
      await new Promise((r) => server.close(r))
    },
  }
}

/**
 * 起 headless Chrome 并等它的 CDP 端口就绪。
 * @param {object} [options]
 * @param {string} [options.profileDir] 用户数据目录（放 .out 下，与既有实测台各用各的）。
 * @returns {Promise<{port: number, close: () => Promise<void>}>} Chrome 句柄。
 */
export async function launchChrome({ profileDir = join(OUT_DIR, 'chrome-profile-snap') } = {}) {
  const exe = process.env.CHROME_PATH
    ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
      .find((p) => existsSync(p))
  if (exe === undefined) throw new Error('找不到 Chrome：设 CHROME_PATH 环境变量')

  const port = await findFreePort()
  const chrome = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' })

  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break } catch { /* 还没起来 */ }
    await sleep(250)
  }

  return {
    port,
    async close() {
      if (chrome.exitCode !== null) return
      const exited = new Promise((r) => chrome.once('exit', r))
      chrome.kill('SIGTERM')
      // SIGTERM 后还不退就硬杀：脚本跑完却留下孤儿 Chrome 是最招人烦的一种失败。
      const timer = setTimeout(() => chrome.kill('SIGKILL'), 3000)
      await exited
      clearTimeout(timer)
    },
  }
}

/**
 * 连上 Chrome 的第一个页面并封装 CDP 调用。
 * @param {number} port Chrome 的调试端口。
 * @returns {Promise<{send: Function, evaluate: Function, close: () => void}>} CDP 客户端。
 */
export async function connectPage(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = list.find((t) => t.type === 'page')
  if (!target) throw new Error('Chrome 里没有可调试的页面')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))

  const send = (method, params = {}) => new Promise((resolveReq, rejectReq) => {
    const i = ++id
    pending.set(i, { resolve: resolveReq, reject: rejectReq })
    ws.send(JSON.stringify({ id: i, method, params }))
  })

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result?.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  return { send, evaluate, close: () => ws.close() }
}

/**
 * 等一个表达式成立。
 * 导航提交与 CDP 执行上下文切换之间有竞态，刚 navigate 完就 evaluate 会拿到旧上下文。
 * @param {Function} evaluate CDP 求值函数。
 * @param {string} expression 待满足的表达式。
 * @param {number} [tries] 最长尝试次数。
 * @returns {Promise<boolean>} 是否等到。
 */
async function waitForExpr(evaluate, expression, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { if (await evaluate(expression)) return true } catch { /* 上下文切换中 */ }
    await sleep(300)
  }
  return false
}

/* 冻结所有动画到固定相位。
   桌宠身上挂着一堆无限循环动画（光环呼吸、高光扫过、眨眼、睡眠 zzz），
   不冻结的话每次截图都是随机相位，参考图与当前图必然对不上。 */
const FREEZE_SCRIPT = `(() => {
  const FIXED = ${FREEZE_MS}
  const pet = document.querySelector('.pet')
  // bench.js 的指针漫游会随机挪动瞳孔；截图前把视线归零，免得拍到随机眼珠。
  if (pet) {
    pet.style.setProperty('--pet-look-x', '0px')
    pet.style.setProperty('--pet-look-y', '0px')
  }
  let n = 0
  for (const a of document.getAnimations()) {
    try { a.pause(); a.currentTime = FIXED; n++ } catch { /* 个别动画不允许改时间轴 */ }
  }
  return n
})()`

/* 截图范围：桌宠本体与它所有可见子节点的并集。
   光环、影子、zzz 都可能溢出 .pet 自身的盒子，只框 .pet 会把它们切掉。 */
const PET_CLIP_SCRIPT = `(() => {
  const pet = document.querySelector('.pet')
  if (!pet) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const acc = (b) => {
    x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top)
    x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom)
  }
  acc(pet.getBoundingClientRect())
  for (const el of pet.querySelectorAll('*')) {
    const b = el.getBoundingClientRect()
    if (b.width === 0 && b.height === 0) continue
    acc(b)
  }
  // 裁剪框不能超出视口：captureBeyondViewport=false 时超出会直接报错。
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0))
  const right = Math.min(window.innerWidth, Math.ceil(x1))
  const bottom = Math.min(window.innerHeight, Math.ceil(y1))
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), scale: 1 }
})()`

/**
 * 把页面带到「某个状态已稳定且动画已冻结」的状态。
 * 每个状态都重新加载页面：bench.js 里有指针漫游等定时逻辑，复用同一个页面会把上一轮的残留带进来。
 * @param {object} options
 * @param {Function} options.send CDP 发送函数。
 * @param {Function} options.evaluate CDP 求值函数。
 * @param {string} options.url 实测页地址。
 * @param {string} options.state 桌宠状态。
 * @returns {Promise<void>} 页面就绪后 resolve。
 */
async function prepareState({ send, evaluate, url, state }) {
  await send('Page.navigate', { url })
  const ready = await waitForExpr(evaluate, 'typeof window.__bench === "object"')
  if (!ready) throw new Error(`实测页没就绪（__bench 缺失）：${url}`)
  await evaluate(`__bench.setState(${JSON.stringify(state)})`)
  await sleep(STATE_SETTLE_MS)
  await evaluate(FREEZE_SCRIPT)
  await sleep(FREEZE_SETTLE_MS)
}

/**
 * 拍一张某个状态的桌宠截图。
 * @param {object} options
 * @param {Function} options.send CDP 发送函数。
 * @param {Function} options.evaluate CDP 求值函数。
 * @param {string} options.url 实测页地址。
 * @param {string} options.state 桌宠状态。
 * @param {object} [options.clip] 裁剪框；不给则按该状态自身的可见范围取。
 * @returns {Promise<{data: string, clip: object}>} base64 PNG 与裁剪框。
 */
export async function capturePetState({ send, evaluate, url, state, clip }) {
  await prepareState({ send, evaluate, url, state })
  const box = clip ?? await evaluate(PET_CLIP_SCRIPT)
  if (!box) throw new Error('页面上找不到 .pet 元素')
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: box, captureBeyondViewport: false })
  return { data, clip: box }
}

/**
 * 求多个裁剪框的并集，作为六张图共用的取景框。
 * 各状态的可见范围略有差别（影子会缩放、表情会挪动），各自取景会让六张图尺寸不一，
 * 跨状态、跨运行的比对都要先对齐尺寸——统一成一个框就省掉了这一步。
 * @param {object[]} rects 各状态的裁剪框。
 * @param {number} viewportWidth 视口宽。
 * @param {number} viewportHeight 视口高。
 * @returns {object} 并集裁剪框。
 */
function unionClip(rects, viewportWidth, viewportHeight) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of rects) {
    if (!r) continue
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.width)
    y1 = Math.max(y1, r.y + r.height)
  }
  const left = Math.max(0, Math.floor(x0))
  const top = Math.max(0, Math.floor(y0))
  const right = Math.min(viewportWidth, Math.ceil(x1))
  const bottom = Math.min(viewportHeight, Math.ceil(y1))
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), scale: 1 }
}

/**
 * 逐个状态拍图。
 *
 * 分两趟：第一趟量出各状态的可见范围，第二趟用**同一个**取景框重拍。
 * 这样六张图尺寸一致，比对时不需要再对齐。
 * @param {object} options
 * @param {Function} options.send CDP 发送函数。
 * @param {Function} options.evaluate CDP 求值函数。
 * @param {string} options.url 实测页地址。
 * @param {string[]} [options.states] 状态列表。
 * @returns {Promise<Record<string, {data: string, clip: object}>>} 状态 → 截图。
 */
export async function capturePetStates({ send, evaluate, url, states = PET_STATES }) {
  const rects = []
  for (const state of states) {
    await prepareState({ send, evaluate, url, state })
    rects.push(await evaluate(PET_CLIP_SCRIPT))
  }
  const [vw, vh] = String(await evaluate('[window.innerWidth, window.innerHeight].join(",")')).split(',').map(Number)
  const clip = unionClip(rects, vw, vh)

  const shots = {}
  for (const state of states) {
    shots[state] = await capturePetState({ send, evaluate, url, state, clip })
  }
  return shots
}

/* 像素比对与差异图都在页面里做：Node 侧没有 PNG 解码器，
   把 PNG 送回页面用 canvas 读像素是这台台子既有的做法（见 verify-rainbow.mjs）。 */
const COMPARE_SCRIPT = `
(async (cur, ref, threshold) => {
  const load = (b64) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('PNG 解码失败'))
    img.src = 'data:image/png;base64,' + b64
  })
  const [a, b] = await Promise.all([load(cur), load(ref)])
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, curSize: [a.width, a.height], refSize: [b.width, b.height] }
  }
  const w = a.width, h = a.height
  const read = (img) => {
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, w, h).data
  }
  const da = read(a), db = read(b)
  let sum = 0, diff = 0
  const total = w * h
  for (let i = 0; i < da.length; i += 4) {
    const dr = Math.abs(da[i] - db[i])
    const dg = Math.abs(da[i + 1] - db[i + 1])
    const dbl = Math.abs(da[i + 2] - db[i + 2])
    sum += (dr + dg + dbl) / 3
    const worst = Math.max(dr, dg, dbl)
    if (worst > threshold) diff++
  }
  return {
    width: w, height: h, total,
    mean: +(sum / total).toFixed(4),
    diffPixels: diff,
    diffRatio: +((diff / total) * 100).toFixed(4),
  }
})(INPUT_A, INPUT_B, INPUT_T)
`

const DIFF_SCRIPT = `
(async (cur, ref, threshold) => {
  const load = (b64) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('PNG 解码失败'))
    img.src = 'data:image/png;base64,' + b64
  })
  const [a, b] = await Promise.all([load(cur), load(ref)])
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height)
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(a, 0, 0)
  const curData = ctx.getImageData(0, 0, w, h)
  const cv2 = document.createElement('canvas')
  cv2.width = w; cv2.height = h
  const ctx2 = cv2.getContext('2d', { willReadFrequently: true })
  ctx2.drawImage(b, 0, 0)
  const refData = ctx2.getImageData(0, 0, w, h)
  for (let i = 0; i < curData.data.length; i += 4) {
    const dr = Math.abs(curData.data[i] - refData.data[i])
    const dg = Math.abs(curData.data[i + 1] - refData.data[i + 1])
    const dbl = Math.abs(curData.data[i + 2] - refData.data[i + 2])
    if (Math.max(dr, dg, dbl) > threshold) {
      curData.data[i] = 255; curData.data[i + 1] = 0; curData.data[i + 2] = 0; curData.data[i + 3] = 255
    } else {
      // 一样的像素压成淡灰，让红色差异点一眼可见。
      const g = (curData.data[i] * 0.299 + curData.data[i + 1] * 0.587 + curData.data[i + 2] * 0.114) * 0.35 + 115
      curData.data[i] = g; curData.data[i + 1] = g; curData.data[i + 2] = g; curData.data[i + 3] = 255
    }
  }
  ctx.putImageData(curData, 0, 0)
  return cv.toDataURL('image/png')
})(INPUT_A, INPUT_B, INPUT_T)
`

/**
 * 逐像素比较两张截图。
 * @param {Function} evaluate CDP 求值函数（截图与参考图会被送进页面读像素）。
 * @param {string} currentB64 当前截图的 base64 PNG。
 * @param {string} refB64 参考图的 base64 PNG。
 * @param {number} [threshold] 通道差阈值，超过即记为差异像素。
 * @returns {Promise<object>} 平均通道差、差异像素占比等指标。
 */
export async function compareShots(evaluate, currentB64, refB64, threshold = DIFF_CHANNEL_THRESHOLD) {
  const expr = COMPARE_SCRIPT
    .replace('INPUT_A', JSON.stringify(currentB64))
    .replace('INPUT_B', JSON.stringify(refB64))
    .replace('INPUT_T', String(threshold))
  return evaluate(expr)
}

/**
 * 生成差异图：差异像素标红，一致的像素压成淡灰。
 * @param {Function} evaluate CDP 求值函数。
 * @param {string} currentB64 当前截图的 base64 PNG。
 * @param {string} refB64 参考图的 base64 PNG。
 * @param {number} [threshold] 通道差阈值。
 * @returns {Promise<string>} PNG 的 data URL。
 */
export async function renderDiffPng(evaluate, currentB64, refB64, threshold = DIFF_CHANNEL_THRESHOLD) {
  const expr = DIFF_SCRIPT
    .replace('INPUT_A', JSON.stringify(currentB64))
    .replace('INPUT_B', JSON.stringify(refB64))
    .replace('INPUT_T', String(threshold))
  return evaluate(expr)
}

/** 清单里的图片路径：能落在 .out 下就写相对 .out 的路径（与既有 manifest 风格一致）。 */
function manifestImagePath(dir, state) {
  const rel = relative(OUT_DIR, join(dir, `${state}.png`))
  if (rel.startsWith('..')) return `${state}.png`
  return rel.split(sep).join('/')
}

/**
 * 把截图写成「六张 PNG + manifest.json」。
 * @param {string} dir 输出目录。
 * @param {Record<string, {data: string}>} shots 状态 → 截图。
 * @param {string[]} [states] 状态列表。
 * @returns {Promise<object>} 写出的 manifest 内容。
 */
export async function writeSnapshot(dir, shots, states = PET_STATES) {
  await mkdir(dir, { recursive: true })
  const images = {}
  for (const state of states) {
    const shot = shots[state]
    if (!shot) continue
    await writeFile(join(dir, `${state}.png`), Buffer.from(shot.data, 'base64'))
    images[state] = manifestImagePath(dir, state)
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    states: states.filter((s) => images[s]),
    images,
  }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
