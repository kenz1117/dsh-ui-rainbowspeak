#!/usr/bin/env node
/**
 * 生成桌宠外形预览页：preview/pet-states.html
 *
 * 为什么单独做一页：桌宠的表情全是 CSS 驱动的（`data-state` 切换），
 * 而真实渲染要连着整个宿主跑起来。预览页把 `src/client/pet.module.css`
 * 原样内联，配上静态标记，一眼就能看全所有状态——改 CSS 时不用
 * 每次都去宿主里点一遍。
 *
 * 页面结构：五个角色 × 六种会话状态的**矩阵**（逐帧核对用），
 * 外加每个角色的待机特写（看默认脸）。
 *
 * 标记结构与 `src/client/pet.tsx` 保持一致（改组件结构时同步改这里）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = process.argv[2] ?? join(repoRoot, 'src/client/pet.module.css')
const outDir = join(repoRoot, 'preview')
const outPath = process.argv[3] ?? join(outDir, 'pet-states.html')
/** 是否同时生成客户端条件模拟页（--no-sim 跳过）。 */
const includeSim = !process.argv.includes('--no-sim')

/** 预览的六种状态与其中文名。 */
const STATES = [
  ['resting', '待机'],
  ['working', '干活'],
  ['waiting', '等你'],
  ['celebrating', '庆祝'],
  ['error', '出错'],
  ['sleeping', '打盹'],
]

/** 五个角色与其中文名（颜色/表情/动作各自独立，见 docs/character-design.md）。 */
const BALLS = [
  ['red', '红红'],
  ['yellow', '黄黄'],
  ['pink', '粉粉'],
  ['blue', '蓝蓝'],
  ['green', '绿绿'],
]

/**
 * 一只桌宠的静态标记（与组件的 DOM 结构一致）。
 * @param state - 状态名。
 * @param ball - 角色球色（data-ball）；默认红球。
 * @param reaction - 额外的 data 反应标记（dizzy / pat）；无则空串。
 * @returns 标记字符串。
 */
function petMarkup(state, ball = 'red', reaction = '') {
  const reactionAttr = reaction === ''
    ? ''
    : reaction.includes(':') ? ` data-${reaction.split(':')[0]}="${reaction.split(':')[1]}"`
      : ` data-${reaction}="true"`
  return `<div class="pet" data-state="${state}" data-ball="${ball}" data-dragging="false" data-remote="connected" data-motion="full"${reactionAttr}>
  <span class="aura"></span>
  <span class="bubble" data-visible="false"></span>
  <button type="button" class="hit">
    <span class="motion">
      <span class="swing">
        <span class="squash">
          <span class="body">
            <span class="sheen"></span>
            <span class="rim"></span>
            <span class="face">
              <span class="eyeLeft"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
              <span class="eyeRight"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
              <span class="blushLeft"></span>
              <span class="blushRight"></span>
              <span class="mouth"><span class="tongue"></span></span>
            </span>
            <span class="sweat"></span>
          </span>
        </span>
      </span>
    </span>
    <span class="shock"></span>
    <span class="sparkles"><span class="sparkle">✦</span><span class="sparkle">✧</span><span class="sparkle">✦</span></span>
    <span class="zzz">z z</span>
  </button>
  <span class="shadow"></span>
</div>`
}

const css = readFileSync(cssPath, 'utf8')

/* 矩阵：行=角色，列=状态 */
const matrixRows = BALLS.map(([ball, name]) => {
  const cells = STATES.map(([state, label]) =>
    `<figure class="cell"><div class="stage">${petMarkup(state, ball)}</div><figcaption>${label}</figcaption></figure>`,
  ).join('\n')
  return `<section class="rowBall"><h2>${name} · ${ball}</h2><div class="grid">${cells}</div></section>`
}).join('\n')

/* 待机特写：默认脸 */
const closeups = BALLS.map(([ball, name]) =>
  `<figure class="cell big"><div class="stage">${petMarkup('resting', ball)}</div><figcaption>${name} 默认脸</figcaption></figure>`,
).join('\n')

/* 一次性反应 */
const REACTIONS = [
  ['dizzy', '晕（转圈后）'],
  ['pat', '被摸摸'],
  ['startle', '惊醒'],
  ['hum', '哼小曲'],
]
const reactionCells = REACTIONS.map(([reaction, label]) =>
  `<figure class="cell"><div class="stage">${petMarkup('resting', 'red', reaction)}</div><figcaption>${label} · <code>${reaction}</code></figcaption></figure>`,
).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>小虹 · 五角色 × 六状态</title>
<style>
${css}
/* 预览页的排版：把桌宠从「固定在窗口右下角」改成矩阵排布。
   尺寸按 112px 定，六列刚好放得下。 */
body { margin: 0; padding: 24px; background: #f6f7f9; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
h1 { margin: 0 0 18px; font-size: 17px; font-weight: 600; color: #222; }
h2 { margin: 22px 0 10px; font-size: 14px; font-weight: 600; color: #444; }
.grid { display: grid; grid-template-columns: repeat(6, max-content); gap: 12px; }
.cell { margin: 0; padding: 10px; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.cell.big .stage { width: 150px; height: 150px; }
.stage { position: relative; width: 112px; height: 112px; }
.stage .pet { position: absolute; inset: 0; width: 112px !important; height: 112px !important; }
figcaption { margin-top: 6px; font-size: 12px; color: #555; text-align: center; }
code { color: #999; }
</style>
</head>
<body>
<h1>小虹 · 五角色 × 六状态</h1>
${matrixRows}
<h1 style="margin-top:24px">默认脸特写</h1>
<div class="grid">${closeups}</div>
<h1 style="margin-top:24px">一次性反应</h1>
<div class="grid">${reactionCells}</div>
</body>
</html>
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, html)
console.log(`preview written: ${outPath}`)

/* ——— 客户端条件模拟页 ———
   预览页没有宿主 CSS、没有指针，两类只有真实客户端才暴露的问题
   （宿主 button/span 规则改形、视线跟随在小球上越界）在预览阶段
   看不见。本页把这两个条件模拟出来：
   1. 注入宿主式规则（白底按钮/圆角矩形 span），验证加固合同；
   2. 脚本驱动视线跟随（与 pet.tsx 同一套数学：球宽 5% + 角色增益）；
   3. 点击播放果冻余振回弹；
   4. 0.7× / 1× / 1.4× 三档尺寸并排——小尺寸是视线越界的高发档。 */
if (includeSim) {
  const SIZE = (k) => Math.round(112 * k)
  const simCells = BALLS.map(([ball, name]) =>
    `<figure class="cell big"><div class="stage" style="width:${SIZE(1)}px;height:${SIZE(1)}px"><div class="pet" data-state="resting" data-ball="${ball}" data-dragging="false" data-remote="connected" data-motion="full" style="width:${SIZE(1)}px;height:${SIZE(1)}px"><span class="aura"></span><span class="bubble" data-visible="false"></span><button type="button" class="hit"><span class="motion"><span class="swing"><span class="squash"><span class="body"><span class="sheen"></span><span class="rim"></span><span class="face"><span class="eyeLeft"><span class="pupil"></span></span><span class="eyeRight"><span class="pupil"></span></span><span class="mouth"><span class="tongue"></span></span></span></span></span></span></button><span class="shadow"></span></div></div><figcaption>${name}·1×</figcaption></figure>`,
  ).join('\n')
  const blueSizes = [0.7, 1, 1.4].map((k) =>
    `<figure class="cell big"><div class="stage" style="width:${SIZE(k)}px;height:${SIZE(k)}px"><div class="pet gaze-demo" data-state="resting" data-ball="blue" data-dragging="false" data-remote="connected" data-motion="full" style="width:${SIZE(k)}px;height:${SIZE(k)}px"><span class="aura"></span><span class="bubble" data-visible="false"></span><button type="button" class="hit"><span class="motion"><span class="swing"><span class="squash"><span class="body"><span class="sheen"></span><span class="rim"></span><span class="face"><span class="eyeLeft"><span class="pupil"></span></span><span class="eyeRight"><span class="pupil"></span></span><span class="mouth"><span class="tongue"></span></span></span></span></span></span></button><span class="shadow"></span></div></div><figcaption>蓝蓝·${k}×</figcaption></figure>`,
  ).join('\n')
  const simHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>小虹 · 客户端条件模拟</title>
<style>
${css}
/* —— 宿主样式模拟：特异性高于插件类，模拟真实客户端的全局规则。
   加固合同（.hit/.eye/.pupil/.aura 的 longhand+!important）应当全部扛住。 —— */
.sim-host button { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
.sim-host button span { border-radius: 10px; }
body { margin: 0; padding: 24px; background: #f6f7f9; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
h1 { margin: 0 0 6px; font-size: 17px; font-weight: 600; color: #222; }
p.tip { margin: 0 0 18px; font-size: 12px; color: #777; }
.grid { display: grid; grid-template-columns: repeat(5, max-content); gap: 16px; }
.cell { margin: 0; padding: 10px; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.stage { position: relative; }
figcaption { margin-top: 6px; font-size: 12px; color: #555; text-align: center; }
</style>
</head>
<body class="sim-host">
<h1>小虹 · 客户端条件模拟</h1>
<p class="tip">本页注入了宿主式规则（button 白底圆角 / span 圆角）并用指针驱动视线——移动鼠标看瞳珠是否越界，点击球看果冻回弹。球上不应出现白色圆角矩形。</p>
<h1 style="font-size:14px">五角色 · 1× · 指针跟随</h1>
<div class="grid">${simCells}</div>
<h1 style="font-size:14px;margin-top:20px">蓝蓝 · 0.7× / 1× / 1.4× · 视线越界检查</h1>
<div class="grid" style="grid-template-columns:repeat(3,max-content)">${blueSizes}</div>
<script>
(() => {
  const GAIN = { blue: 0.3, green: 0.5, pink: 1, red: 1, yellow: 1 }
  const pets = [...document.querySelectorAll('.pet')]
  let pending = null
  const apply = () => {
    for (const pet of pets) {
      const rect = pet.getBoundingClientRect()
      if (!rect.width) continue
      const gain = GAIN[pet.dataset.ball] ?? 1
      const max = rect.width * 0.05
      let dx = pending.x - (rect.left + rect.width / 2)
      let dy = pending.y - (rect.top + rect.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(1, max / d)
      const x = dx * k * gain, y = dy * k * gain
      const t = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)'
      for (const p of pet.querySelectorAll('.pupil')) p.style.transform = t
      const swing = pet.querySelector('.swing')
      if (swing) swing.style.transform = 'rotate(' + (x * 0.22).toFixed(3) + 'deg)'
    }
  }
  window.addEventListener('pointermove', (e) => { pending = { x: e.clientX, y: e.clientY }; apply() })
  // 无鼠标时自行演示：一个绕场游走的合成指针。
  let t0 = performance.now()
  const demo = (now) => {
    if (pending === null) {
      const w = innerWidth, h = innerHeight
      pending = { x: w / 2 + Math.cos((now - t0) / 1700) * w * 0.38, y: h / 2 + Math.sin((now - t0) / 2300) * h * 0.3 }
      apply()
      pending = null
    }
    requestAnimationFrame(demo)
  }
  requestAnimationFrame(demo)
  for (const pet of pets) {
    pet.addEventListener('click', () => {
      const el = pet.querySelector('.squash')
      if (!el) return
      el.animate([
        { transform: 'scale(1.16, 0.86)' },
        { transform: 'scale(0.95, 1.06)', offset: 0.38 },
        { transform: 'scale(1.03, 0.975)', offset: 0.58 },
        { transform: 'scale(0.988, 1.01)', offset: 0.74 },
        { transform: 'scale(1.008, 0.995)', offset: 0.87 },
        { transform: 'scale(1, 1)' },
      ], { duration: 560, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'none' })
    })
  }
})()
</script>
</body>
</html>`
  const simPath = join(outDir, 'pet-client-sim.html')
  writeFileSync(simPath, simHtml)
  console.log(`client-sim preview written: ${simPath}`)
}
