#!/usr/bin/env node
/**
 * 生成桌宠外形预览页：preview/pet-states.html
 *
 * 为什么单独做一页：桌宠的六种表情全是 CSS 驱动的（`data-state` 切换），
 * 而真实渲染要连着整个宿主跑起来。预览页把 `src/client/pet.module.css`
 * 原样内联，配上六份静态标记，一眼就能看全六种状态——改 CSS 时不用
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

/** 一次性反应（不能常驻，预览成静态格子）。 */
const REACTIONS = [
  ['dizzy', '晕（转圈后）'],
  ['pat', '被摸摸'],
]

/** 剪影与呆毛路径（与 pet.tsx 的常量一致）。 */
const DROP_PATH = 'M 50 6 C 73.2 6 92 23.9 92 46 C 92 68.1 73.2 86 50 86 C 26.8 86 8 68.1 8 46 C 8 23.9 26.8 6 50 6 Z'
const DROP_PATH_BB = 'M 0.5 0.06 C 0.732 0.06 0.92 0.239 0.92 0.46 C 0.92 0.681 0.732 0.86 0.5 0.86 C 0.268 0.86 0.08 0.681 0.08 0.46 C 0.08 0.239 0.268 0.06 0.5 0.06 Z'
const TIP_PATH = 'M 69 -5 C 63.5 -1.5 56.5 3.5 54 9 C 51.8 14 54.5 18.6 59.5 19 C 64.5 19.4 67.8 15.8 67.5 10.5 C 67.3 6 68 -0.5 69 -5 Z'

/**
 * 一只桌宠的静态标记（与组件的 DOM 结构一致）。
 * @param state - 状态名。
 * @param reaction - 额外的 data 反应标记（dizzy / pat）；无则空串。
 * @returns 标记字符串。
 */
function petMarkup(state, reaction = '') {
  const reactionAttr = reaction === '' ? '' : ` data-${reaction}="true"`
  return `<div class="pet" data-state="${state}" data-dragging="false" data-remote="connected" data-motion="full"${reactionAttr}>
  <span class="aura"></span>
  <span class="bubble" data-visible="false"></span>
  <button type="button" class="hit">
    <span class="motion">
      <span class="body">
        <span class="sheen"></span>
        <span class="face">
          <span class="eyeLeft"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
          <span class="eyeRight"><span class="pupil"></span><span class="glint"></span><span class="glintDot"></span><span class="dizzyX"></span></span>
          <span class="browLeft"></span>
          <span class="browRight"></span>
          <span class="blushLeft"></span>
          <span class="blushRight"></span>
          <span class="mouth"><span class="tongue"></span></span>
        </span>
      </span>
      <svg class="dropShape" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <clipPath id="rainbowspeak-drop" clipPathUnits="objectBoundingBox">
            <path d="${DROP_PATH_BB}"></path>
          </clipPath>
          <linearGradient id="rainbowspeak-tip" x1="0.7" y1="0" x2="0.3" y2="1">
            <stop offset="0" stop-color="#ffd9d9"></stop>
            <stop offset="0.48" stop-color="#ff9c9c"></stop>
            <stop offset="1" stop-color="#ff6b6b"></stop>
          </linearGradient>
          <linearGradient id="rainbowspeak-tip-amber" x1="0.7" y1="0" x2="0.3" y2="1">
            <stop offset="0" stop-color="#fef3c7"></stop>
            <stop offset="0.48" stop-color="#fcd34d"></stop>
            <stop offset="1" stop-color="#f59e0b"></stop>
          </linearGradient>
          <linearGradient id="rainbowspeak-tip-red" x1="0.7" y1="0" x2="0.3" y2="1">
            <stop offset="0" stop-color="#fee2e2"></stop>
            <stop offset="0.48" stop-color="#fca5a5"></stop>
            <stop offset="1" stop-color="#ef4444"></stop>
          </linearGradient>
        </defs>
        <path class="tipFill" d="${TIP_PATH}" vector-effect="non-scaling-stroke"></path>
        <path class="dropEdge" d="${DROP_PATH}" vector-effect="non-scaling-stroke"></path>
        <path class="dropEdgeInner" d="${DROP_PATH}" vector-effect="non-scaling-stroke"></path>
      </svg>
      <span class="sweat"></span>
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
