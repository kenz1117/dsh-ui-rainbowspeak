/**
 * 量「当前实现」里各角色的部件实际渲染盒（相对脸盒的百分比），
 * 用来和参考图刻度读数逐项对——不靠目测。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const server = createServer(async (req, res) => {
  const b = await readFile(join(here, '../../preview/pet-states.html'))
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(b)
})
await new Promise((r) => server.listen(8912, r))
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9417', `--user-data-dir=${join(here, '.out/chrome-profile-mi')}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:9417/json/version')).ok) break } catch {} await sleep(250) }
const list = await (await fetch('http://127.0.0.1:9417/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:8912/' })
await sleep(2200)
await evaluate(`(()=>{const st=document.createElement('style');st.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.appendChild(st)})()`)
await sleep(400)

const out = await evaluate(`(() => {
  const names={'红红':'red','黄黄':'yellow','粉粉':'pink','蓝蓝':'blue','绿绿':'green'}
  const res={}
  for(const el of document.querySelectorAll('.cell.big')){
    const label=el.querySelector('figcaption').textContent.split(' ')[0]
    const name=names[label]
    const face=el.querySelector('.face').getBoundingClientRect()
    /* 双口径：border-box（getBoundingClientRect）与 content-box（扣掉 border）。
       CSS 变量里的百分比是 content-box 口径；带 border 的部件（嘴描边等）
       直接比 border-box 会误判「偏大」。 */
    const rel=(elm)=>{
      const r=elm.getBoundingClientRect()
      const cs=getComputedStyle(elm)
      const bx=(parseFloat(cs.borderLeftWidth)||0)+(parseFloat(cs.borderRightWidth)||0)
      const by=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0)
      const fmt=(rr)=>({x:+((rr.x-face.x)/face.width*100).toFixed(1), y:+((rr.y-face.y)/face.height*100).toFixed(1),
              w:+(rr.width/face.width*100).toFixed(1), h:+(rr.height/face.height*100).toFixed(1)})
      return {border:fmt(r), content:fmt({x:r.x+(parseFloat(cs.borderLeftWidth)||0), y:r.y+(parseFloat(cs.borderTopWidth)||0), width:r.width-bx, height:r.height-by}), borderW:[cs.borderTopWidth,cs.borderRightWidth,cs.borderBottomWidth,cs.borderLeftWidth].join('/')}
    }
    res[name]={
      face:[+face.width.toFixed(1),+face.height.toFixed(1)],
      眼左: rel(el.querySelector('.eyeLeft')),
      瞳左: rel(el.querySelector('.eyeLeft .pupil')),
      嘴: rel(el.querySelector('.mouth')),
    }
  }
  return res
})()`)
console.log('部件位置/尺寸，单位 = 脸盒的百分比（脸宽 = 2R）。border=含描边盒，content=内容盒（CSS % 口径）\\n')
for (const [name, v] of Object.entries(out)) {
  console.log(`=== ${name} === 脸盒 ${v.face.join('×')}px`)
  for (const k of ['眼左', '瞳左', '嘴']) {
    const g = v[k]
    console.log(`  ${k}  border x${String(g.border.x).padStart(6)} y${String(g.border.y).padStart(6)} ${g.border.w}×${g.border.h}  | content x${String(g.content.x).padStart(6)} y${String(g.content.y).padStart(6)} ${g.content.w}×${g.content.h}  | borderW ${g.borderW}`)
  }
}
server.close(); ws.close(); chrome.kill(); process.exit(0)
