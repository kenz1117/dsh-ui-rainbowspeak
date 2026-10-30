#!/usr/bin/env node
/**
 * 关键验证：hue-rotate 方案在「非全色轮」配色下会不会跑偏。
 *
 * 跑马灯除彩虹外还有琥珀色（审批等待 attention）、红色（出错 error），
 * 以及 cyberpunk / sunset 等窄色相方案。它们**不是完整的色轮**——
 * 对它们做 hue-rotate 等于把整条色带转到别的色相去（琥珀会转成绿色）。
 * 旋转图层方案不受影响：它转的是「渐变本身」。
 *
 * 本脚本截下边框实际渲染出来的像素，读出色相，对比两版。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

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
if (CHROME === undefined) throw new Error('找不到 Chrome')
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9380', `--user-data-dir=${join(ROOT, 'chrome-profile-p')}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9380/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9380/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result?.value
}
await send('Page.enable'); await send('Runtime.enable')

/** 在页面里把截图读回 canvas，取边框顶边若干点的色相。 */
const READ_HUES = `((b64) => new Promise((res, rej) => {
  const img = new Image()
  img.onload = () => {
    const cv = document.createElement('canvas')
    cv.width = img.width; cv.height = img.height
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const out = []
    for (const x of [80, 240, 400, 560, 720]) {
      const d = ctx.getImageData(x, 1, 1, 1).data
      const [r, g, b] = [d[0] / 255, d[1] / 255, d[2] / 255]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn
      if (dd < 0.02) { out.push(null); continue }
      let h
      if (mx === r) h = ((g - b) / dd) % 6
      else if (mx === g) h = (b - r) / dd + 2
      else h = (r - g) / dd + 4
      out.push(+(((h * 60) % 360 + 360) % 360).toFixed(1))
    }
    res(out)
  }
  img.onerror = rej
  img.src = 'data:image/png;base64,' + b64
}))`

/** 采样并给出「这些色相落在哪个色相区间」的判断。 */
function verdict(hues) {
  const valid = hues.filter((h) => h !== null)
  if (valid.length === 0) return '（未采到彩色像素）'
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const spread = Math.max(...valid) - Math.min(...valid)
  const name = (h) => {
    if (h < 15 || h >= 345) return '红'
    if (h < 45) return '橙'
    if (h < 70) return '黄'
    if (h < 160) return '绿'
    if (h < 200) return '青'
    if (h < 255) return '蓝'
    if (h < 290) return '紫'
    return '品红'
  }
  return `平均色相 ${avg.toFixed(0)}°（${name(avg)}），跨度 ${spread.toFixed(0)}°`
}

/** 沿一个完整周期连续采样，看色相会不会随相位漂移。 */
async function probe(label, query, state) {
  await send('Page.navigate', { url: `http://127.0.0.1:8899/index.html${query}` })
  await sleep(2500)
  await evaluate(`document.documentElement.dataset.rainbowState = '${state}'`)
  await sleep(600)
  const series = []
  for (let i = 0; i < 8; i++) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 40, y: 40, width: 860, height: 4, scale: 1 } })
    const hues = await evaluate(`(${READ_HUES})(${JSON.stringify(data)})`)
    const valid = hues.filter((h) => h !== null)
    if (valid.length > 0) series.push(+(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1))
    await sleep(600)
  }
  const min = Math.min(...series), max = Math.max(...series)
  console.log(`${label.padEnd(16)} ${state.padEnd(10)} 平均色相序列 ${JSON.stringify(series)}`)
  console.log(`${''.padEnd(16)} ${''.padEnd(10)} 漂移范围 ${(max - min).toFixed(0)}°（${min}°→${max}°）`)
}

console.log('=== 审批等待：琥珀配色（期望：始终是琥珀/橙黄，约 30–50°）===')
await probe('改造前（角度插值）', '?ref=1', 'attention')
await probe('改造后（旋转图层）', '', 'attention')

console.log('\n=== 出错：红色配色（期望：始终是红，约 350–10°）===')
await probe('改造前（角度插值）', '?ref=1', 'error')
await probe('改造后（旋转图层）', '', 'error')

ws.close(); chrome.kill(); server.close(); process.exit(0)
