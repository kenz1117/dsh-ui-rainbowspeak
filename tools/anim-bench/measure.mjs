#!/usr/bin/env node
/**
 * 正式测量：对照组 + 3 次重复取中位数。
 *   control     空白页（测指标地板：RecalcStyleCount 的每帧基线）
 *   baseline    现状
 *   look-direct 瞳孔直接写 transform
 *   rainbow-tf  跑马灯改为旋转图层
 *   both        两项同改
 */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '.out')
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  if (path === '/control.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>control</title><body>control</body>'); return }
  try { const b = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'text/plain' }); res.end(b) }
  catch { res.writeHead(404); res.end('x') }
})
await new Promise((r) => server.listen(8899, r))

const CHROME = process.env.CHROME_PATH
  ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => existsSync(p))
if (CHROME === undefined) throw new Error('找不到 Chrome：设 CHROME_PATH 环境变量')
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9350', `--user-data-dir=${join(ROOT, 'chrome-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9350/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9350/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let events = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
  else if (m.method) events.push(m)
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result?.value
}
await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable')

const KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount']
async function metrics() {
  const { metrics: m } = await send('Performance.getMetrics')
  const o = {}; for (const i of m) o[i.name] = i.value
  return o
}
const delta = (a, b) => Object.fromEntries(KEYS.map((k) => [k, +(b[k] - a[k]).toFixed(4)]))

async function trace(ms) {
  events = []
  await send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] },
  })
  await sleep(ms)
  await send('Tracing.end')
  for (let i = 0; i < 80; i++) { if (events.some((e) => e.method === 'Tracing.tracingComplete')) break; await sleep(100) }
  const all = events.filter((e) => e.method === 'Tracing.dataCollected').flatMap((e) => e.params.value)
  const pick = (n) => all.filter((e) => e.name === n)
  const sum = (n) => pick(n).reduce((a, e) => a + (e.dur ?? 0), 0)
  const area = pick('Paint').reduce((a, e) => {
    const rects = e.args?.data?.paintRect ?? []
    return a + rects.reduce((s, r) => s + r[2] * r[3], 0)
  }, 0)
  return {
    paint: pick('Paint').length,
    paintMs: +(sum('Paint') / 1000).toFixed(1),
    paintAreaPx: area,
    raster: pick('RasterTask').length,
    rasterMs: +(sum('RasterTask') / 1000).toFixed(1),
    layerUpdate: pick('UpdateLayerTree').length,
    styleRecalc: pick('UpdateLayoutTree').length,
    styleRecalcMs: +(sum('UpdateLayoutTree') / 1000).toFixed(1),
    frames: pick('DrawFrame').length,
  }
}

async function goto(url) {
  await send('Page.navigate', { url })
  await sleep(800)
  await waitForExpr('document.readyState === "complete"')
  await sleep(600)
}

/** 等一个表达式成立（导航提交与执行上下文切换之间有竞态，不能想当然）。 */
async function waitForExpr(expression, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { if (await evaluate(expression)) return true } catch { /* 上下文切换中 */ }
    await sleep(300)
  }
  return false
}

/**
 * 等目标元素出现：导航提交与 CDP 执行上下文切换之间存在竞态，
 * 直接 querySelector 可能拿到 null —— 那不是「页面坏了」，是「还没到」。
 * @param selector - 目标选择器。
 * @param tries - 最长等待次数（每次 300ms）。
 * @returns 是否等到了。
 */
async function waitFor(selector, tries = 25) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(300)
  }
  return false
}

/** 变体自检：确认跑马灯真的在动（基线=角度插值，变体=旋转图层）。 */
async function sanity(query) {
  // 自检要在一张干净的页面上做：重新载入，避免受前一轮 trace/导航影响。
  await goto(`http://127.0.0.1:8899/index.html${query}`)
  const ready = await waitFor('[data-composer-card]')
  const where = await evaluate('location.href + " | " + document.readyState')
  if (!ready) return { where, ok: false, reason: '目标元素未出现' }
  const card = 'document.querySelector("[data-composer-card]")'
  const hasRing = await evaluate('!!document.querySelector(".rs-conic")')
  const before = await evaluate(`getComputedStyle(${card}, "::before").animationName`)
  if (hasRing) {
    // 旋转图层：色彩层的 transform 矩阵应当随时间变化。
    const r1 = await evaluate(`(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector(".rs-conic")).transform); return +m.b.toFixed(4) })()`)
    await sleep(700)
    const r2 = await evaluate(`(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector(".rs-conic")).transform); return +m.b.toFixed(4) })()`)
    return { where, ok: true, mode: 'ring', layerMoving: r1 !== r2, layerRotation: [r1, r2] }
  }
  // 基准：::before 的角度插值应当随时间变化。
  const a1 = await evaluate(`getComputedStyle(${card}, "::before").getPropertyValue("--dsh-rainbow-angle")`)
  await sleep(700)
  const a2 = await evaluate(`getComputedStyle(${card}, "::before").getPropertyValue("--dsh-rainbow-angle")`)
  return { where, ok: true, mode: 'angle', beforeAnim: before, angleMoved: a1 !== a2, angle: [a1.trim(), a2.trim()] }
}

async function idleRun() {
  await evaluate('__bench.record(true)')
  const a = await metrics()
  await sleep(3000)
  const b = await metrics()
  const frames = await evaluate('__bench.frames()')
  await evaluate('__bench.record(false)')
  return { frames, m: delta(a, b) }
}
async function sweepRun() {
  await sleep(200)
  await evaluate('__bench.record(true)')
  const a = await metrics()
  for (let i = 0; i < 240; i++) {
    const x = 200 + (i % 120) * 8
    const y = 400 + Math.round(Math.sin(i / 6) * 120)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
    await sleep(8)
  }
  const b = await metrics()
  const frames = await evaluate('__bench.frames()')
  await evaluate('__bench.record(false)')
  return { frames, m: delta(a, b) }
}

/** 状态切换：量「换表情」引发的 layout 次数与耗时。 */
async function stateRun() {
  await sleep(200)
  const a = await metrics()
  for (const st of ['working', 'waiting', 'celebrating', 'error', 'sleeping', 'resting']) {
    await evaluate(`__bench.setState('${st}')`)
    await sleep(400)
  }
  const b = await metrics()
  return { m: delta(a, b) }
}

const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const VARIANTS = [
  // 改造前基准：冻结的样式 + 老的变量驱动瞳孔 + @property 角度插值跑马灯。
  ['ref', '?ref=1&look=var'],
  // 改造后：旋转图层跑马灯 + 直接写 transform 的瞳孔。
  ['live', '?look=direct'],
  // 只换跑马灯，瞳孔仍是老的变量驱动——用来隔离跑马灯这一项。
  ['live-look-var', '?look=var'],
  // 改造后 + 摘掉几何过渡——用来归因 layout。
  ['live-no-geo', '?look=direct&pet=no-geo'],
]
const REPS = 3
const out = {}

/* —— 对照组：空白页的指标地板 —— */
await goto('http://127.0.0.1:8899/control.html')
await sleep(1500)
{
  const a = await metrics(); await sleep(3000); const b = await metrics()
  out.control = { recalcCount: b.RecalcStyleCount - a.RecalcStyleCount, recalcMs: +(b.RecalcStyleDuration - a.RecalcStyleDuration).toFixed(4), taskMs: +(b.TaskDuration - a.TaskDuration).toFixed(4) }
}

for (const [name, query] of VARIANTS) {
  const runs = []
  for (let i = 0; i < REPS; i++) {
    await goto(`http://127.0.0.1:8899/index.html${query}`)
    const ready = await waitForExpr('typeof window.__bench === "object"')
    if (!ready) {
      const where = await evaluate('location.href + " | " + document.readyState')
      throw new Error(`变体 ${name} 的页面没就绪（__bench 缺失）：${where}——先看 bench.js 是否抛错`)
    }
    const idle = await idleRun()
    const sweep = await sweepRun()
    const state = await stateRun()
    await sleep(400)
    const tr = await trace(3000)
    runs.push({ idle, sweep, state, trace: tr })
  }
  out[name] = {
    sanity: await sanity(query),
    idleFrames: runs.map((r) => r.idle.frames),
    sweepFrames: runs.map((r) => r.sweep.frames),
    sweepRecalcMs: runs.map((r) => r.sweep.m.RecalcStyleDuration),
    sweepTaskMs: runs.map((r) => r.sweep.m.TaskDuration),
    idleRecalcMs: runs.map((r) => r.idle.m.RecalcStyleDuration),
    paint: runs.map((r) => r.trace.paint),
    paintAreaPx: runs.map((r) => r.trace.paintAreaPx),
    raster: runs.map((r) => r.trace.raster),
    styleRecalc: runs.map((r) => r.trace.styleRecalc),
    styleRecalcMs: runs.map((r) => r.trace.styleRecalcMs),
    stateLayoutCount: runs.map((r) => r.state.m.LayoutCount),
    stateLayoutMs: runs.map((r) => r.state.m.LayoutDuration),
    med: {
      sweepRecalcMs: median(runs.map((r) => r.sweep.m.RecalcStyleDuration)),
      sweepTaskMs: median(runs.map((r) => r.sweep.m.TaskDuration)),
      paint: median(runs.map((r) => r.trace.paint)),
      paintAreaPx: median(runs.map((r) => r.trace.paintAreaPx)),
      raster: median(runs.map((r) => r.trace.raster)),
      styleRecalcMs: median(runs.map((r) => r.trace.styleRecalcMs)),
      stateLayoutCount: median(runs.map((r) => r.state.m.LayoutCount)),
      stateLayoutMs: median(runs.map((r) => r.state.m.LayoutDuration)),
    },
  }
  console.error(`done ${name}`)
}

await writeFile(join(ROOT, 'results.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
ws.close(); chrome.kill(); server.close(); process.exit(0)
