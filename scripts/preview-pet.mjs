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
