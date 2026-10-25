#!/usr/bin/env node
/**
 * 生成桌宠外形预览页：preview/pet-states.html
 *
 * 为什么单独做一页：桌宠的表情全是 CSS 驱动的（`data-state` 切换），
 * 而真实渲染要连着整个宿主跑起来。预览页把 `src/client/pet.module.css`
 * 原样内联，配上静态标记，一眼就能看全所有状态——改 CSS 时不用
 * 每次都去宿主里点一遍。
 *
 * 标记结构与 `src/client/pet.tsx` 保持一致（改组件结构时同步改这里）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = join(repoRoot, 'src/client/pet.module.css')
const outDir = join(repoRoot, 'preview')
const outPath = join(outDir, 'pet-states.html')

/** 预览的六种状态与其中文名。 */
const STATES = [
  ['resting', '待机'],
  ['working', '干活'],
  ['waiting', '等你'],
  ['celebrating', '庆祝'],
  ['error', '出错'],
  ['sleeping', '打盹'],
]

/** 一次性反应与入场动画（不能常驻，预览成静态格子；attr 可带值：entrance:pop）。 */
const REACTIONS = [
  ['dizzy', '晕（转圈后）'],
  ['pat', '被摸摸'],
  ['startle', '惊醒'],
  ['hum', '哼小曲'],
  ['entrance:pop', '入场·弹现'],
  ['entrance:hop', '入场·蹦入'],
]

/**
 * 一只桌宠的静态标记（与组件的 DOM 结构一致）。
 * @param state - 状态名。
 * @param reaction - 额外的 data 反应标记（dizzy / pat）；无则空串。
 * @returns 标记字符串。
 */
function petMarkup(state, reaction = '') {
  const reactionAttr = reaction === '' ? ''
    : reaction.includes(':') ? ` data-${reaction.split(':')[0]}="${reaction.split(':')[1]}"`
      : ` data-${reaction}="true"`
  return `<div class="pet" data-state="${state}" data-dragging="false" data-remote="connected" data-motion="full"${reactionAttr}>
  <span class="aura"></span>
  <span class="bubble" data-visible="false"></span>
  <button type="button" class="hit">
    <span class="motion">
      <span class="body">
        <span class="tip"></span>
        <span class="sheen"></span>
        <span class="rim"></span>
        <span class="face">
          <span class="eyeLeft"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
          <span class="eyeRight"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
          <span class="browLeft"></span>
          <span class="browRight"></span>
          <span class="blushLeft"></span>
          <span class="blushRight"></span>
          <span class="mouth"><span class="tongue"></span></span>
        </span>
        <span class="sweat"></span>
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
const cells = STATES.map(([state, label]) =>
  `<figure class="cell"><div class="stage">${petMarkup(state)}</div><figcaption>${label} · <code>${state}</code></figcaption></figure>`,
).join('\n')
const reactionCells = REACTIONS.map(([reaction, label]) =>
  `<figure class="cell"><div class="stage">${petMarkup('resting', reaction)}</div><figcaption>${label} · <code>${reaction}</code></figcaption></figure>`,
).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>小虹 · 六种表情预览</title>
<style>
${css}
/* 预览页的排版：把桌宠从「固定在窗口右下角」改成「排成一行」。
   尺寸按窄视口（≈680px）定，三列刚好放得下——宽屏也不会散开。 */
body { margin: 0; padding: 24px; background: #f6f7f9; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
h1 { margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #222; }
.grid { display: grid; grid-template-columns: repeat(3, max-content); gap: 14px; }
.cell { margin: 0; padding: 12px; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.stage { position: relative; width: 112px; height: 112px; }
.stage .pet { position: absolute; inset: 0; width: 112px !important; height: 112px !important; }
figcaption { margin-top: 8px; font-size: 12px; color: #555; text-align: center; }
code { color: #999; }
</style>
</head>
<body>
<h1>小虹 · 六种表情</h1>
<div class="grid">
${cells}
</div>
<h1 style="margin-top:20px">一次性反应</h1>
<div class="grid">
${reactionCells}
</div>
</body>
</html>
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, html)
console.log(`preview written: ${outPath}`)
