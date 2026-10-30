#!/usr/bin/env node
/**
 * 参考图五官刻度图：把每颗球的脸部区域放大并叠上以「半径百分比」标注的网格。
 * 用途：对着网格读出眼白/虹膜/嘴/眼镜的真实边界与中心，写进 CSS 变量——
 *        全程按像素读，不靠目测。
 *
 * 用法：node tools/anim-bench/measure-grid.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const REF = process.env.REF_IMAGE ?? '/Users/ken/.minimax/v2/assets/2026/10/30/11-23-55-394-asset_20261030-112355-394_bf487b0546fe_2bdd9448-image.png'
if (!existsSync(REF)) { console.error('找不到参考图：', REF); process.exit(2) }
const b64 = (await readFile(REF)).toString('base64')

const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9415', '--user-data-dir=/tmp/mgrid', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9415/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9415/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'data:text/html,<body>' })
await sleep(500)

/* 每颗球单独一张大图，网格每 10%R 一条并标注 */
// 实测：参考图里五颗球的真实圆心与半径（R = 0.15×图宽 = 120px）
const balls = {
  pink: [0.1569, 0.3444], yellow: [0.4975, 0.3456], red: [0.8394, 0.3419],
  green: [0.2869, 0.7106], blue: [0.6969, 0.7094],
}
const BALL_R = 0.1494
const per = {}
for (const [name, [fx, fy]] of Object.entries(balls)) {
  const FX=fx, FY=fy
  per[name] = await evaluate(`(async () => {
    const img = await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,${b64}'})
    const W=img.width,H=img.height
    const R=${BALL_R}*H
    const S=760, HALF=1.0
    const cv=document.createElement('canvas'); cv.width=S; cv.height=S+30
    const ctx=cv.getContext('2d')
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S+30)
    const half=R*HALF, size=half*2
    ctx.drawImage(img, Math.round(${FX}*W-half), Math.round(${FY}*H-half), Math.round(size), Math.round(size), 0, 30, S, S)
    const pxPerR=S/(HALF*2)
    ctx.lineWidth=1; ctx.font='bold 12px sans-serif'
    for(let g=-100;g<=100;g+=5){
      const p=S/2+g*pxPerR/100*100
      const py=S/2+g*pxPerR
      ctx.strokeStyle=(g%10===0)?'rgba(255,0,0,.7)':'rgba(0,120,255,.3)'
      ctx.beginPath();ctx.moveTo(p,30);ctx.lineTo(p,30+S);ctx.stroke()
      ctx.beginPath();ctx.moveTo(0,30+py);ctx.lineTo(S,30+py);ctx.stroke()
      if(g%20===0){
        ctx.fillStyle='rgba(190,0,0,.95)'
        ctx.fillText(g+'%R', p+2, 46)
        ctx.fillText(g+'%R', 4, 30+py-3)
      }
    }
    ctx.fillStyle='#111'; ctx.font='bold 15px sans-serif'
    ctx.fillText('${name}', 6, 20)
    return cv.toDataURL('image/png').split(',')[1]
  })()`)
}
for (const [name, data] of Object.entries(per)) {
  await writeFile(join(here, '.out/grid-' + name + '.png'), Buffer.from(data, 'base64'))
}
console.log('刻度图 → tools/anim-bench/.out/grid-<name>.png（网格单位：半径百分比，10% 一条标注）')
ws.close(); chrome.kill(); process.exit(0)
