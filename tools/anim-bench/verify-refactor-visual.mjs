#!/usr/bin/env node
/**
 * 改造前 vs 改造后的桌宠视觉比对。
 *
 * 回答一个问题：把表情几何从布局属性（width/height/top/margin）换成
 * scale/translate 之后，**看起来还是不是同一只小虹**？
 *
 * 注意：0.5 之后五个角色按五月天参考图重做了形象与表情（见
 * docs/character-design.md），所以这里的差异是**预期内**的——
 * 本工具现在用于量化「形象改了多少」，不再是「有没有意外改动」的闸门。
 * 真正的逐帧回归用 verify-pet-visual.mjs（与基准图逐像素比）。
 *
 * 做法：用同一套标记，分别套「冻结的改造前样式」与「当前样式」，
 * 渲染成两张图后逐像素比对。连续动画（呼吸/点头/跳跃/眨眼）会因截图
 * 相位不同而误判成差异，所以比对前先把动画整体移除（animation: none），
 * 让两张图都停在确定的状态上。
 *
 * 用法：
 *   node tools/anim-bench/verify-refactor-visual.mjs
 *
 * 输出：
 *   差异统计 + 差异图（.out/pet-refactor-diff.png）
 *   退出码：差异占比低于阈值 → 0，否则 1
 */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const OUT = join(here, '.out')

/** 判定阈值：差异像素占比。 */
const MAX_RATIO = 0.005

const CHROME = process.env.CHROME_PATH
  ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => existsSync(p))
if (CHROME === undefined) throw new Error('找不到 Chrome：设 CHROME_PATH 环境变量')

/* 1) 生成「改造前」的对照预览页：同一套标记 + 冻结的基准样式。 */
const REF_CSS = join(here, 'reference/pet.module.css')
if (!existsSync(REF_CSS)) throw new Error('缺少基准样式：tools/anim-bench/reference/pet.module.css')
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/preview-pet.mjs'], { cwd: repoRoot, stdio: 'ignore' })
  child.on('exit', (code) => { code === 0 ? resolve() : reject(new Error('生成预览页失败')) })
})
const previewScript = await readFile(join(repoRoot, 'scripts/preview-pet.mjs'), 'utf8')
await writeFile(
  join(OUT, 'preview-pet-ref.mjs'),
  previewScript
    .replace("?? join(repoRoot, 'src/client/pet.module.css')", `?? ${JSON.stringify(REF_CSS)}`)
    .replace("const outDir = join(repoRoot, 'preview')", `const outDir = ${JSON.stringify(OUT)}`)
    .replace("?? join(outDir, 'pet-states.html')", `?? join(outDir, 'pet-states-ref.html')`),
)
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(OUT, 'preview-pet-ref.mjs')], { cwd: repoRoot, stdio: 'ignore' })
  child.on('exit', (code) => { code === 0 ? resolve() : reject(new Error('生成基准预览页失败')) })
})

const NEW_PAGE = join(repoRoot, 'preview/pet-states.html')
const REF_PAGE = join(OUT, 'pet-states-ref.html')

/* 2) 起服务，把两页都渲染出来比对。 */
const server = createServer(async (req, res) => {
  const file = req.url.split('?')[0] === '/ref' ? REF_PAGE : NEW_PAGE
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(body)
  } catch { res.writeHead(404); res.end('x') }
})
await new Promise((r) => server.listen(8905, r))

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9395', `--user-data-dir=${join(OUT, 'chrome-profile-refactor')}`,
  '--no-first-run', '--hide-scrollbars', '--window-size=900,1400', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9395/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9395/json/list')).json()
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

async function shoot(url) {
  await send('Page.navigate', { url })
  await sleep(1200)
  // 冻结动画：连续动画在两次截图里相位不同，会把「相位差」误判成「视觉差异」。
  await evaluate(`(() => {
    const st = document.createElement('style')
    st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'
    document.head.appendChild(st)
  })()`)
  await sleep(400)
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  return data
}

const shotA = await shoot('http://127.0.0.1:8905/ref')
const shotB = await shoot('http://127.0.0.1:8905/new')

const CMP = `((a, b) => new Promise((res, rej) => {
  const load = (x) => new Promise((r2, j2) => { const i = new Image(); i.onload = () => r2(i); i.onerror = j2; i.src = 'data:image/png;base64,' + x })
  Promise.all([load(a), load(b)]).then(([ia, ib]) => {
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const grab = (img) => { ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, w, h).data }
    const da = grab(ia), db = grab(ib)
    let diff = 0, sum = 0
    const out = ctx.createImageData(w, h)
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2]))
      sum += d
      if (d > 16) { diff++; out.data[i] = 255; out.data[i+1] = 0; out.data[i+2] = 0; out.data[i+3] = 255 }
      else { out.data[i] = db[i]; out.data[i+1] = db[i+1]; out.data[i+2] = db[i+2]; out.data[i+3] = 90 }
    }
    ctx.putImageData(out, 0, 0)
    res({ w, h, diffPixels: diff, total: w * h, ratio: diff / (w * h), mean: sum / (w * h / 4), png: cv.toDataURL('image/png').split(',')[1] })
  })
}))`

const r = await evaluate(`(${CMP})(${JSON.stringify(shotA)}, ${JSON.stringify(shotB)})`)
console.log(`画布 ${r.w}×${r.h}`)
console.log(`差异像素 ${r.diffPixels}（占比 ${(r.ratio * 100).toFixed(3)}%）  平均通道差 ${r.mean.toFixed(3)}`)
await writeFile(join(OUT, 'pet-refactor-diff.png'), Buffer.from(r.png, 'base64'))
console.log(`差异图 → ${join(OUT, 'pet-refactor-diff.png')}`)
const ok = r.ratio <= MAX_RATIO
console.log(ok
  ? `✅ 在阈值内（${(MAX_RATIO * 100).toFixed(1)}%）：改造后与改造前视觉一致`
  : `⚠️ 差异 ${(r.ratio * 100).toFixed(3)}%（阈值 ${(MAX_RATIO * 100).toFixed(1)}%）：`
    + '形象按参考图重做后差异是预期内的——逐帧回归请看 verify-pet-visual.mjs')

ws.close(); chrome.kill(); server.close()
process.exit(ok ? 0 : 1)
