#!/usr/bin/env node
/**
 * 五官对位三联图（A1/A3）+ 数值收敛对照（迭代主工具）：
 *   每球一行：参考(2R) | 实现(2R) | 差分，三联同尺度、同裁切（都是整球），
 *   参考与实现两栏都叠 10%R 网格，人眼可在同一根刻度线上直接比对。
 *   同时用 scan-faces-precise 的同一套分类/连通域算法分别扫两侧，
 *   打印「部件 bbox 参考值 vs 实现值 vs Δ」——数字对齐才算对齐。
 *
 * 实现侧裁的是 .face 盒（= 2R），并隐藏 aura/shadow 等球外效果，
 * 差分只衡量球本身。快照取 resting 态、动画全停。
 *
 * 用法：node tools/anim-bench/compare-faces.mjs
 * 产出：tools/anim-bench/.out/face-<name>.png ×5、face-compare.png、终端对照表
 */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REF = process.env.REF_IMAGE ?? '/Users/ken/.minimax/v2/assets/2026/10/30/11-23-55-394-asset_20261030-112355-394_bf487b0546fe_2bdd9448-image.png'
const refB64 = (await readFile(REF)).toString('base64')

const server = createServer(async (req, res) => {
  const b = await readFile(join(here, '../../preview/pet-states.html'))
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(b)
})
await new Promise((r) => server.listen(8913, r))

const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9421', `--user-data-dir=${join(here, '.out/chrome-profile-cf')}`, '--no-first-run', '--hide-scrollbars', '--window-size=1000,1200', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9421/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9421/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:8913/' })
await sleep(2200)
/* 冻结动画；藏掉球外效果（aura/shadow），差分只评球本身。 */
await evaluate(`(()=>{const st=document.createElement('style');st.textContent='*,*::before,*::after{animation:none!important;transition:none!important}.aura,.shadow{display:none!important}';document.head.appendChild(st)})()`)
await sleep(400)

/* 截实现侧每球的脸盒（= 球 = 2R） */
const shots = {}
for (const name of ['pink', 'yellow', 'red', 'green', 'blue']) {
  const rect = await evaluate(`(()=>{
    const el=[...document.querySelectorAll('.cell.big')].find(e=>e.textContent.includes('${{pink:'粉粉',yellow:'黄黄',red:'红红',green:'绿绿',blue:'蓝蓝'}[name]}'))
    const f=el.querySelector('.face').getBoundingClientRect()
    return [f.x+window.scrollX, f.y+window.scrollY, f.width, f.height]
  })()`)
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: rect[0], y: rect[1], width: rect[2], height: rect[3], scale: 3 } })
  shots[name] = data
}

const result = await evaluate(`(async () => {
  const load=(b64)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+b64})
  const refImg=await load(${JSON.stringify(refB64)})
  const shots=${JSON.stringify(shots)}
  /* 参考图球心/半径：scan-faces-precise 实测 */
  const BALLS={ pink:[125.5,275.5,121], yellow:[398,276.5,122.5], red:[671,273.5,121.5], green:[229,568.5,121.5], blue:[557,567.5,121.5] }
  const ORDER=['pink','yellow','red','green','blue']
  const S=300

  const hex=(c)=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')
  const cropToCanvas=(img,sx,sy,sw,sh)=>{
    const cv=document.createElement('canvas'); cv.width=S; cv.height=S
    const x=cv.getContext('2d',{willReadFrequently:true})
    x.imageSmoothingEnabled=true; x.drawImage(img,sx,sy,sw,sh,0,0,S,S)
    return cv
  }
  /* 与 scan-faces-precise 同一套：底色中位数 + 分类连通域 */
  const scan=(cv)=>{
    const S2=cv.width
    const px=cv.getContext('2d').getImageData(0,0,S2,S2).data
    const at=(x,y)=>{const i=(y*S2+x)*4;return [px[i],px[i+1],px[i+2]]}
    /* 底色取样：避开镜框/眼睛/嘴，取下半球与中轴的纯底色点 */
    const pts=[[.5,.88],[.3,.78],[.7,.78],[.5,.55],[.15,.5],[.85,.5]].map(([a,b])=>at(Math.round(a*S2),Math.round(b*S2)))
    const base=[0,1,2].map(k=>{const v=pts.map(p=>p[k]).sort((a,b)=>a-b);return v[3]})
    const dist=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]))
    const cls=(c)=>{
      if(dist(c,base)<=30) return 0
      if(Math.min(c[0],c[1],c[2])>200) return 1
      if(Math.max(c[0],c[1],c[2])<95) return 2
      return 3
    }
    const R=S2/2, lab=new Int32Array(S2*S2).fill(-1), comps=[]
    let label=0
    const stack=new Int32Array(S2*S2)
    for(let y=0;y<S2;y++)for(let x=0;x<S2;x++){
      if(lab[y*S2+x]!==-1)continue
      const dx=x-R, dy=y-R
      const c=cls(at(x,y))
      lab[y*S2+x]=-2
      if(c===0||dx*dx+dy*dy>(R*0.97)**2)continue
      let top=0; stack[top++]=y*S2+x; lab[y*S2+x]=label
      let minX=x,maxX=x,minY=y,maxY=y,area=0,sx=0,sy=0
      const acc=[0,0,0]
      while(top>0){
        const p=stack[--top]; const qx=p%S2, qy=(p/S2)|0; area++
        const c2=at(qx,qy)
        for(let k=0;k<3;k++)acc[k]+=c2[k]
        sx+=qx; sy+=qy
        if(qx<minX)minX=qx; if(qx>maxX)maxX=qx; if(qy<minY)minY=qy; if(qy>maxY)maxY=qy
        for(const [ddx,ddy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
          const nx=qx+ddx, ny=qy+ddy
          if(nx<0||ny<0||nx>=S2||ny>=S2)continue
          const q=ny*S2+nx
          if(lab[q]!==-1)continue
          const ndx=nx-R, ndy=ny-R
          if(ndx*ndx+ndy*ndy>(R*0.97)**2){lab[q]=-2;continue}
          if(cls(at(nx,ny))!==c){lab[q]=-2;continue}
          lab[q]=label; stack[top++]=q
        }
      }
      if(area>=8) comps.push({cls:['base','white','black','color'][c],area,minX,maxX,minY,maxY,cx:sx/area,cy:sy/area,mean:hex(acc.map(v=>Math.round(v/area)))})
    }
    const pct=(v)=>+(v/S2*100).toFixed(1)
    return { baseHex:hex(base), comps:comps.sort((a,b)=>b.area-a.area).map(f=>({
      cls:f.cls, area:f.area, mean:f.mean,
      bbox:[pct(f.minX),pct(f.minY),pct(f.maxX-f.minX+1),pct(f.maxY-f.minY+1)],
      c:[pct(f.cx),pct(f.cy)],
    })) }
  }

  const out=[]
  const panels=[]
  for(const name of ORDER){
    const [fx,fy,fr]=BALLS[name]
    const refCv=cropToCanvas(refImg, fx-fr, fy-fr, fr*2, fr*2)
    const implImg=await load(shots[name])
    const implCv=cropToCanvas(implImg, 0, 0, implImg.width, implImg.height)
    const refScan=scan(refCv), implScan=scan(implCv)
    /* 差分 */
    const rpx=refCv.getContext('2d').getImageData(0,0,S,S).data
    const ipx=implCv.getContext('2d').getImageData(0,0,S,S).data
    const dcv=document.createElement('canvas'); dcv.width=S; dcv.height=S
    const dctx=dcv.getContext('2d')
    const dimg=dctx.createImageData(S,S)
    let diff=0, big=0
    for(let i=0;i<S*S*4;i+=4){
      const d=(Math.abs(rpx[i]-ipx[i])+Math.abs(rpx[i+1]-ipx[i+1])+Math.abs(rpx[i+2]-ipx[i+2]))/3
      const g=255-Math.min(255,d*2.5)
      dimg.data[i]=dimg.data[i+1]=dimg.data[i+2]=g; dimg.data[i+3]=255
      diff+=d; if(d>40)big++
    }
    dctx.putImageData(dimg,0,0)
    panels.push({name, refCv, implCv, dcv})
    out.push({name, refBase:refScan.baseHex, implBase:implScan.baseHex,
      meanDiff:+(diff/(S*S)).toFixed(1), bigPct:+(big/(S*S)*100).toFixed(1),
      refComps:refScan.comps.slice(0,8), implComps:implScan.comps.slice(0,8)})
  }
  /* 拼大图：每行 [参考 | 实现 | 差分]，网格 10%R */
  const GAP=8, LABEL=22
  const cv=document.createElement('canvas')
  cv.width=S*3+GAP*2; cv.height=(S+LABEL)*ORDER.length
  const ctx=cv.getContext('2d')
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height)
  const grid=(x0,y0)=>{
    ctx.save(); ctx.beginPath(); ctx.rect(x0,y0,S,S); ctx.clip()
    for(let g=-100;g<=100;g+=10){
      const p=x0+S/2+g/100*S/2, q=y0+S/2+g/100*S/2
      ctx.strokeStyle='rgba(255,0,0,.45)'; ctx.beginPath(); ctx.moveTo(p,y0); ctx.lineTo(p,y0+S); ctx.stroke()
      ctx.strokeStyle='rgba(0,120,255,.45)'; ctx.beginPath(); ctx.moveTo(x0,q); ctx.lineTo(x0+S,q); ctx.stroke()
    }
    ctx.restore()
  }
  ORDER.forEach((name,i)=>{
    const p=panels.find(q=>q.name===name)
    const y=i*(S+LABEL)
    ctx.drawImage(p.refCv,0,y+LABEL); grid(0,y+LABEL)
    ctx.drawImage(p.implCv,S+GAP,y+LABEL); grid(S+GAP,y+LABEL)
    ctx.drawImage(p.dcv,(S+GAP)*2,y+LABEL)
    ctx.fillStyle='#333'; ctx.font='bold 12px sans-serif'
    ctx.fillText(name+' 参考',4,y+14); ctx.fillText(name+' 实现',S+GAP+4,y+14); ctx.fillText(name+' 差分',(S+GAP)*2+4,y+14)
  })
  return { png: cv.toDataURL('image/png').split(',')[1], out }
})()`)

await writeFile(join(here, '.out/face-compare.png'), Buffer.from(result.png, 'base64'))
for (const b of result.out) {
  await writeFile(join(here, `.out/face-${b.name}.png`), Buffer.from(shots[b.name], 'base64'))
}
console.log('三联图 → tools/anim-bench/.out/face-compare.png（每行: 参考 | 实现 | 差分，网格 10%R）\n')
for (const b of result.out) {
  console.log(`================ ${b.name} ================  底色 参考${b.refBase} vs 实现${b.implBase}  平均|Δ|=${b.meanDiff}  Δ>40占比=${b.bigPct}%`)
  console.log('  [参考] ' + b.refComps.map(f=>`${f.cls}#${f.area}@${f.bbox.join(',')}c(${f.c})${f.mean}`).join('  '))
  console.log('  [实现] ' + b.implComps.map(f=>`${f.cls}#${f.area}@${f.bbox.join(',')}c(${f.c})${f.mean}`).join('  '))
}
server.close(); ws.close(); chrome.kill(); process.exit(0)
