#!/usr/bin/env node
/**
 * 跑马灯视觉等价验证：旋转图层方案 vs 角度插值方案。
 *
 * 主张：「把锥形渐变整层旋转 θ」≡「把渐变起始角插值到 θ」——
 * 两版在卡片边框上呈现的色相序列应当只差一个**恒定相位**。
 *
 * 做法：两版各截一张图，把边框顶边同一排像素读出来转成色相，
 * 逐点求差。若差值是常数（只差截图时刻的相位），则实现等价；
 * 若差值随位置系统性漂移，说明几何对不上（渐变圆心或遮罩错位）。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '.out')
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try { const b = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'text/plain' }); res.end(b) }
  catch { res.writeHead(404); res.end('x') }
})
await new Promise((r) => server.listen(8899, r))

const CHROME = process.env.CHROME_PATH
  ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => existsSync(p))
if (CHROME === undefined) throw new Error('找不到 Chrome：设 CHROME_PATH 环境变量')
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9362', `--user-data-dir=${join(ROOT, 'chrome-profile-v')}`,
  '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9362/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9362/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); const events = []
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
await send('Page.enable'); await send('Runtime.enable')

/* 卡片位置：与 build.mjs 的页面样式一致（left 40 / top 40 / 860×220 / 2px 环带）。 */
const CARD = { x: 40, y: 40, w: 860, h: 220 }
const CLIP = { x: CARD.x, y: CARD.y, width: CARD.w, height: 12, scale: 1 }

async function shoot(query) {
  await send('Page.navigate', { url: `http://127.0.0.1:8899/index.html${query}` })
  await sleep(2500)
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: CLIP, captureBeyondViewport: false })
  return data
}

const shotA = await shoot('?ref=1')          // 改造前：@property 角度插值
const shotB = await shoot('')                 // 改造后：旋转图层
const shotC = await shoot('?rainbow=hue')     // 备选：hue-rotate
writeFileSync(join(ROOT, 'shot-baseline.png'), Buffer.from(shotA, 'base64'))
writeFileSync(join(ROOT, 'shot-rainbow-tf.png'), Buffer.from(shotB, 'base64'))

/* 在页面里做像素采样（canvas 读回截图，避开 Node 端的 PNG 解码依赖）。 */
const script = `
(async (a, b) => {
  const load = (b64) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = 'data:image/png;base64,' + b64
  })
  const [ia, ib] = await Promise.all([load(a), load(b)])
  const cv = document.createElement('canvas')
  cv.width = ia.width; cv.height = ia.height
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const hueAt = (img, x, y) => {
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(x, y, 1, 1).data
    const [r, g, bl] = [d[0] / 255, d[1] / 255, d[2] / 255]
    const max = Math.max(r, g, bl), min = Math.min(r, g, bl), dd = max - min
    if (dd < 0.02) return null            // 近灰：不是彩色像素，跳过
    let h
    if (max === r) h = ((g - bl) / dd) % 6
    else if (max === g) h = (bl - r) / dd + 2
    else h = (r - g) / dd + 4
    return ((h * 60) % 360 + 360) % 360
  }
  const row = 1                              // 2px 环带的中线
  const out = []
  for (let x = 60; x <= 860; x += 20) {
    const ha = hueAt(ia, x, row)
    const hb = hueAt(ib, x, row)
    if (ha === null || hb === null) continue
    let d = ha - hb
    while (d > 180) d -= 360
    while (d < -180) d += 360
    out.push({ x, ha: +ha.toFixed(1), hb: +hb.toFixed(1), d: +d.toFixed(1) })
  }
  const mean = out.reduce((s, r) => s + r.d, 0) / out.length
  const sd = Math.sqrt(out.reduce((s, r) => s + (r.d - mean) ** 2, 0) / out.length)
  return { samples: out.length, meanDiff: +mean.toFixed(2), sdDiff: +sd.toFixed(2), points: out }
})(INPUT_A, INPUT_B)
`

const run = async (b) => evaluate(script.replace('INPUT_A', JSON.stringify(shotA)).replace('INPUT_B', JSON.stringify(b)))
const result = await run(shotB)
const resultHue = await run(shotC)
console.log(`采样点 ${result.samples} 个`)
console.log(`两版色相差：均值 ${result.meanDiff}°，标准差 ${result.sdDiff}°`)
console.log('判定：', result.sdDiff < 12
  ? '✅ 等价（差值是恒定相位，随截图时刻变化）—— 旋转图层方案可替代角度插值'
  : '❌ 不等价（差值随位置漂移）—— 几何对不上，别上这个方案')
console.log('抽样：', JSON.stringify(result.points.filter((_, i) => i % 6 === 0)))
console.log(`\n[备选] hue-rotate 方案：均值 ${resultHue.meanDiff}°，标准差 ${resultHue.sdDiff}° →`,
  resultHue.sdDiff < 12 ? '✅ 等价' : '❌ 不等价')

ws.close(); chrome.kill(); server.close(); process.exit(0)
