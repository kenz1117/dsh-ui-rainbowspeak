#!/usr/bin/env node
/**
 * 定向全段扫描 v2：对指定列/行输出「完整色段」(run-length)，坐标一律用
 * % 脸宽（脸盒=2R，基于 scan-faces-precise.mjs 实测的球心/半径）。
 * 用途：黄球眼红白叠层、绿球橙瞳位置、蓝球镜框厚度/鼻梁、V嘴分层。
 *
 * 用法：node tools/anim-bench/scan-runs.mjs
 */
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const REF = process.env.REF_IMAGE ?? '/Users/ken/.minimax/v2/assets/2026/10/30/11-23-55-394-asset_20261030-112355-394_bf487b0546fe_2bdd9448-image.png'
if (!existsSync(REF)) { console.error('找不到参考图'); process.exit(2) }
const b64 = (await readFile(REF)).toString('base64')

const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9433', '--user-data-dir=/tmp/scan-runs', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9433/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9433/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'data:text/html,<body>' })
await sleep(400)

const result = await evaluate(`(async () => {
  const img = await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,${b64}'})
  const W=img.width,H=img.height
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H
  const ctx=cv.getContext('2d',{willReadFrequently:true})
  ctx.drawImage(img,0,0)
  const px=ctx.getImageData(0,0,W,H).data
  const hex=(c)=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')
  const isWhite=(c)=>c[0]>242&&c[1]>242&&c[2]>242

  /* 球心/半径（scan-faces-precise 实测） */
  const B={
    pink:{cx:125.5,cy:275.5,R:121,base:[231,108,163]},
    yellow:{cx:398,cy:276.5,R:122.5,base:[240,205,63]},
    red:{cx:671,cy:273.5,R:121.5,base:[218,54,29]},
    green:{cx:229,cy:568.5,R:121.5,base:[28,169,57]},
    blue:{cx:557,cy:567.5,R:121.5,base:[43,166,225]},
  }
  const P=(ball,xp,yp)=>{const b=B[ball];return [Math.round(b.cx+(xp-50)/100*2*b.R), Math.round(b.cy+(yp-50)/100*2*b.R)]}
  const at=(x,y)=>{const i=(y*W+x)*4;return [px[i],px[i+1],px[i+2]]}
  const nameOf=(ball,c)=>{
    const base=B[ball].base
    const d=(a,b2)=>Math.max(Math.abs(a[0]-b2[0]),Math.abs(a[1]-b2[1]),Math.abs(a[2]-b2[2]))
    if(isWhite(c)) return 'white'
    if(d(c,base)<=30) return 'base'
    if(Math.max(c[0],c[1],c[2])<95) return 'black'
    return hex(c)
  }
  /* 沿 % 脸宽坐标的横/竖切全段 */
  const runsH=(ball, yp)=>{ // 横切：y 固定
    const b=B[ball], out=[]
    let prev=null, startX=0
    for(let xp=0;xp<=100;xp+=0.1){
      const [gx,gy]=P(ball,xp,yp)
      const n=nameOf(ball,at(gx,gy))
      if(n!==prev){ if(prev!==null&&prev!=='base') out.push([+startX.toFixed(1),+xp.toFixed(1),prev]); prev=n; startX=xp }
    }
    if(prev&&prev!=='base') out.push([+startX.toFixed(1),100,prev])
    return out
  }
  const runsV=(ball, xp)=>{ // 竖切：x 固定
    const b=B[ball], out=[]
    let prev=null, startY=0
    for(let yp=0;yp<=100;yp+=0.1){
      const [gx,gy]=P(ball,xp,yp)
      const n=nameOf(ball,at(gx,gy))
      if(n!==prev){ if(prev!==null&&prev!=='base') out.push([+startY.toFixed(1),+yp.toFixed(1),prev]); prev=n; startY=yp }
    }
    if(prev&&prev!=='base') out.push([+startY.toFixed(1),100,prev])
    return out
  }

  /* 绿球橙瞳：在眼部区域找橙色像素质心与 bbox */
  const orange=(ball,x0,x1,y0,y1)=>{
    let sx=0,sy=0,n=0,minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9
    const acc=[0,0,0]
    for(let yp=y0;yp<=y1;yp+=0.1)for(let xp=x0;xp<=x1;xp+=0.1){
      const [gx,gy]=P(ball,xp,yp); const c=at(gx,gy)
      if(c[0]>205&&c[1]>120&&c[1]<200&&c[2]<110&&c[0]-c[2]>110){
        sx+=xp;sy+=yp;n++
        for(let k=0;k<3;k++)acc[k]+=c[k]
        if(xp<minX)minX=xp;if(xp>maxX)maxX=xp;if(yp<minY)minY=yp;if(yp>maxY)maxY=yp
      }
    }
    return n>10?{n,cx:+(sx/n).toFixed(2),cy:+(sy/n).toFixed(2),bbox:[+minX.toFixed(1),+minY.toFixed(1),+(maxX-minX).toFixed(1),+(maxY-minY).toFixed(1)],mean:hex(acc.map(v=>Math.round(v/n)))}:null
  }

  return {
    picks:{
      redIrisL: hex(at(...P('red',35.3,46.4))), redIrisR: hex(at(...P('red',63.5,48))),
      redMouth: hex(at(...P('red',50,63.4))),
      pinkIrisL: hex(at(...P('pink',38,45.9))), pinkIrisR: hex(at(...P('pink',64.5,46.7))),
      pinkMouthThick: hex(at(...P('pink',52.9,61.9))),
      yellowEyeRed: hex(at(...P('yellow',38.6,46.8))),
      yellowMouthBlack: hex(at(...P('yellow',58,63.9))),
      greenMouth: hex(at(...P('green',55,55.5))),
      blueFrameTopL: hex(at(...P('blue',40,31.6))), blueFrameTopR: hex(at(...P('blue',62,31.6))),
      bluePupilL: hex(at(...P('blue',44.3,41.8))), blueMouthV: hex(at(...P('blue',51.7,59.2))),
      orangeL: orange('green',36,49,36,50), orangeR: orange('green',48,62,34,48),
    },
    yellowEyeL_v32: runsV('yellow',32), yellowEyeL_v386: runsV('yellow',38.6), yellowEyeL_v45: runsV('yellow',45),
    yellowEyeL_h435: runsH('yellow',43.5), yellowEyeL_h47: runsH('yellow',47), yellowEyeL_h51: runsH('yellow',51),
    yellowEyeR_v66: runsV('yellow',66), yellowEyeR_v586: runsV('yellow',58.6),
    greenEyeL_v433: runsV('green',43.3), greenEyeL_h43: runsH('green',43.3),
    greenEyeR_v552: runsV('green',55.2), greenEyeR_h41: runsH('green',41.5),
    blueFrameL_v30: runsV('blue',30), blueFrameL_v40: runsV('blue',40), blueFrameL_v47: runsV('blue',47),
    blueFrame_h32: runsH('blue',32), blueFrame_h418: runsH('blue',41.8), blueFrame_h53: runsH('blue',53),
    blueBridge_v51: runsV('blue',51.6),
    blueMouth_v48: runsV('blue',48), blueMouth_v517: runsV('blue',51.7), blueMouth_v55: runsV('blue',55),
    blueMouth_h59: runsH('blue',59.2),
  }
})()`)

console.log('纯色取样 / 橙瞳检测:', JSON.stringify(result.picks, null, 1))
for (const [k, v] of Object.entries(result)) {
  if (k === 'picks') continue
  console.log(`\\n${k}:`)
  for (const r of v) console.log(`  ${String(r[0]).padStart(6)} – ${String(r[1]).padStart(6)}  ${r[2]}`)
}
ws.close(); chrome.kill(); process.exit(0)
