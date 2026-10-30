#!/usr/bin/env node
/**
 * 参考图逐像素精测 v2（「不许猜」的读数来源）：
 *   1. 实测五颗球圆心/半径（按底色色相自动识别角色，不依赖排序假设）；
 *   2. 底色多点取样 + 中位数 → 平涂/渐变判定（B1）；
 *   3. 按颜色分类（白眼白 / 黑笔迹 / 彩色部件）分别做连通域，
 *      每块输出 bbox/质心/均色，单位 % 脸宽（脸盒 = 2R）；
 *   4. 笔迹块按列/行输出 min/max 扫描线（走向直接可读）；
 *   5. 导出每球 3× 放大裁切图 + 嘴部特写，供形状目检。
 *
 * 用法：node tools/anim-bench/scan-faces-precise.mjs
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
  ['--headless=new', '--remote-debugging-port=9431', '--user-data-dir=/tmp/scan-faces', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9431/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9431/json/list')).json()
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
  const at=(x,y)=>{const i=(y*W+x)*4;return [px[i],px[i+1],px[i+2]]}
  const dist=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]))
  const hex=(c)=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')

  /* —— 1. 球体检测 —— */
  const isWhite=(c)=>c[0]>242&&c[1]>242&&c[2]>242
  const visited=new Int32Array(W*H)
  const raw=[]
  {
    let label=0
    const stack=new Int32Array(W*H)
    for(let sy=0;sy<H;sy+=2)for(let sx=0;sx<W;sx+=2){
      if(visited[sy*W+sx]||isWhite(at(sx,sy)))continue
      let top=0; stack[top++]=sy*W+sx; visited[sy*W+sx]=1
      let minX=sx,maxX=sx,minY=sy,maxY=sy,area=0
      while(top>0){
        const p=stack[--top]; const x=p%W, y=(p/W)|0; area++
        if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=x+dx, ny=y+dy
          if(nx<0||ny<0||nx>=W||ny>=H)continue
          const q=ny*W+nx
          if(visited[q]||isWhite(at(nx,ny)))continue
          visited[q]=1; stack[top++]=q
        }
      }
      if(area>20000) raw.push({minX,maxX,minY,maxY,area,cx:(minX+maxX)/2,cy:(minY+maxY)/2,R:(maxX-minX+1)/2})
    }
  }
  /* 底色：9 个取样点逐通道中位数（躲开杂色像素） */
  const medianColor=(CX,CY,R)=>{
    const pts=[[0,0],[0,-.55],[0,.55],[-.55,0],[.55,0],[-.62,-.62],[.62,-.62],[-.62,.62],[.62,.62]]
      .map(([dx,dy])=>at(Math.round(CX+dx*R),Math.round(CY+dy*R)))
    return [0,1,2].map(k=>{const v=pts.map(p=>p[k]).sort((a,b)=>a-b);return v[(v.length/2)|0]})
  }
  const PAL={ red:[218,54,29], yellow:[240,205,63], pink:[231,108,163], blue:[43,166,225], green:[28,169,57] }
  const balls=[]
  for(const b of raw){
    const base=medianColor(b.cx,b.cy,b.R)
    let name='?',best=1e9
    for(const [n,c] of Object.entries(PAL)){ const d=dist(base,c); if(d<best){best=d;name=n} }
    balls.push({name, bbox:[b.minX,b.minY,b.maxX,b.maxY], cx:b.cx, cy:b.cy, R:b.R, baseHex:hex(base), base})
  }

  const out={size:[W,H], balls:[]}
  for(const bb of balls){
    const R=bb.R, CX=bb.cx, CY=bb.cy, base=bb.base
    const ball={name:bb.name, bbox:bb.bbox, cx:+CX.toFixed(1), cy:+CY.toFixed(1), R:+R.toFixed(1),
      cxNorm:+(CX/W).toFixed(4), cyNorm:+(CY/H).toFixed(4), rNorm:+(R/W).toFixed(4), baseHex:bb.baseHex}

    /* —— 2. 平涂判定 —— */
    const put=(dx,dy)=>hex(at(Math.round(CX+dx*R),Math.round(CY+dy*R)))
    ball.flat={
      cross:[put(0,-.55),put(0,.55),put(-.55,0),put(.55,0)],
      diag:[put(-.62,-.62),put(.62,-.62),put(-.62,.62),put(.62,.62)],
      edge:[put(0,-.93),put(0,.93),put(-.93,0),put(.93,0)],
    }

    /* —— 3. 按类别连通域：base / white / black / color —— */
    const x0=Math.round(CX-R), y0=Math.round(CY-R), w=2*Math.round(R)+1
    const classify=(c)=>{
      if(dist(c,base)<=28) return 0
      if(Math.min(c[0],c[1],c[2])>200) return 1
      if(Math.max(c[0],c[1],c[2])<90) return 2
      return 3
    }
    const lab=new Int32Array(w*w).fill(-1)
    const comps=[]
    {
      let label=0
      const stack=new Int32Array(w*w)
      for(let ly=0;ly<w;ly++)for(let lx=0;lx<w;lx++){
        if(lab[ly*w+lx]!==-1)continue
        const gx=x0+lx, gy=y0+ly, dx=gx-CX, dy=gy-CY
        const cls=(dx*dx+dy*dy>(R*0.96)**2)?0:classify(at(gx,gy))
        lab[ly*w+lx]=-2
        if(cls===0)continue
        let top=0; stack[top++]=ly*w+lx; lab[ly*w+lx]=label
        let minX=lx,maxX=lx,minY=ly,maxY=ly,area=0,sx=0,sy=0
        const acc=[0,0,0]
        while(top>0){
          const p=stack[--top]; const qx=p%w, qy=(p/w)|0; area++
          const c2=at(x0+qx,y0+qy)
          for(let k=0;k<3;k++)acc[k]+=c2[k]
          sx+=qx; sy+=qy
          if(qx<minX)minX=qx; if(qx>maxX)maxX=qx; if(qy<minY)minY=qy; if(qy>maxY)maxY=qy
          for(const [ddx,ddy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            const nx=qx+ddx, ny=qy+ddy
            if(nx<0||ny<0||nx>=w||ny>=w)continue
            const q=ny*w+nx
            if(lab[q]!==-1)continue
            const gx3=x0+nx, gy3=y0+ny, dx3=gx3-CX, dy3=gy3-CY
            if(dx3*dx3+dy3*dy3>(R*0.96)**2){lab[q]=-2;continue}
            if(classify(at(gx3,gy3))!==cls){lab[q]=-2;continue}
            lab[q]=label; stack[top++]=q
          }
        }
        if(area>=24) comps.push({label,cls,area,minX,maxX,minY,maxY,cx:sx/area,cy:sy/area,mean:acc.map(v=>Math.round(v/area))})
      }
    }
    const pct=(v)=>+(v/(2*R)*100).toFixed(2)
    ball.comps=comps.sort((a,b2)=>b2.area-a.area).map(f=>({
      cls:['base','white','black','color'][f.cls], area:f.area, mean:hex(f.mean),
      bbox:{ x:pct(f.minX), y:pct(f.minY), w:pct(f.maxX-f.minX+1), h:pct(f.maxY-f.minY+1) },
      c:{ x:pct(f.cx), y:pct(f.cy) },
    }))

    /* —— 4. 笔迹扫描线（black/color 且面积>150 的块）—— */
    ball.traces=[]
    for(const f of comps){
      if(f.area<150||f.cls==='white'||f.cls==='base')continue
      const inComp=(lx,ly)=>lab[ly*w+lx]===f.label
      const cols=[],rows=[]
      for(let lx=f.minX;lx<=f.maxX;lx+=2){
        let mn=-1,mx=-1
        for(let ly=f.minY;ly<=f.maxY;ly++){if(inComp(lx,ly)){if(mn<0)mn=ly;mx=ly}}
        if(mn>=0)cols.push([pct(lx),pct(mn),pct(mx)])
      }
      for(let ly=f.minY;ly<=f.maxY;ly+=2){
        let mn=-1,mx=-1
        for(let lx=f.minX;lx<=f.maxX;lx++){if(inComp(lx,ly)){if(mn<0)mn=lx;mx=lx}}
        if(mn>=0)rows.push([pct(ly),pct(mn),pct(mx)])
      }
      ball.traces.push({cls:f.cls,area:f.area,mean:hex(f.mean),cols,rows})
    }

    /* —— 5. 导出 3× 裁切图（整球 + 嘴部特写）—— */
    const S=Math.round(2*R*3)
    const crop=document.createElement('canvas'); crop.width=S; crop.height=S
    const cctx=crop.getContext('2d'); cctx.imageSmoothingEnabled=false
    cctx.drawImage(img, Math.round(CX-R), Math.round(CY-R), Math.round(2*R), Math.round(2*R), 0, 0, S, S)
    ball.ballPng=crop.toDataURL('image/png').split(',')[1]
    const mouthTop=Math.round(CY-R+(56/100)*2*R), mouthH=Math.round(2*R*0.16)
    const mw=Math.round(2*R*0.5), mx0=Math.round(CX-R*0.5)
    const mc=document.createElement('canvas'); mc.width=mw*3; mc.height=mouthH*3
    const mctx=mc.getContext('2d'); mctx.imageSmoothingEnabled=false
    mctx.drawImage(img, mx0, mouthTop, mw, mouthH, 0, 0, mw*3, mouthH*3)
    ball.mouthPng=mc.toDataURL('image/png').split(',')[1]
    out.balls.push(ball)
  }
  return out
})()`)

for (const b of result.balls) {
  console.log(`\n================ ${b.name} ================`)
  console.log(`球 bbox=${b.bbox} 中心=(${b.cx},${b.cy}) R=${b.R}px  (归一化 cx=${b.cxNorm} cy=${b.cyNorm} r=${b.rNorm})  底色=${b.baseHex}`)
  console.log(`平涂检查: 十字 ${b.flat.cross.join(' ')} | 对角 ${b.flat.diag.join(' ')} | 边环 ${b.flat.edge.join(' ')}`)
  console.log(`部件（%脸宽）:`)
  for (const f of b.comps) {
    console.log(`  [${f.cls.padEnd(5)}] area=${String(f.area).padStart(6)} mean=${f.mean} bbox x${f.bbox.x} y${f.bbox.y} ${f.bbox.w}×${f.bbox.h} 中心(${f.c.x},${f.c.y})`)
  }
  console.log(`笔迹扫描线（[x%, yMin%, yMax%]）:`)
  for (const t of b.traces) {
    console.log(`  [${t.cls}] area=${t.area} mean=${t.mean}`)
    console.log(`    cols: ${JSON.stringify(t.cols)}`)
    if (t.cols.length && t.rows.length && Math.max(...t.rows.map(r=>r[2]-r[1])) - Math.max(...t.cols.map(c=>c[2]-c[1])) > 2) {
      console.log(`    rows: ${JSON.stringify(t.rows)}`)
    }
  }
  await writeFile(join(here, `.out/zoom-${b.name}.png`), Buffer.from(b.ballPng, 'base64'))
  await writeFile(join(here, `.out/zoom-mouth-${b.name}.png`), Buffer.from(b.mouthPng, 'base64'))
}
console.log('\n裁切图 → tools/anim-bench/.out/zoom-<name>.png 与 zoom-mouth-<name>.png')
ws.close(); chrome.kill(); process.exit(0)
