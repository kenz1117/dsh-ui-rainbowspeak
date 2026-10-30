#!/usr/bin/env node
/**
 * 动画性能实测台 · 页面生成
 *
 * 从仓库源码抽取**真实**样式与标记，生成可对照的测试页：
 * - 桌宠样式：直接内联 `src/client/pet.module.css`（原文照抄）；
 * - 跑马灯样式：从 `src/client/index.ts` 的 `rainbowCss()` 模板抽取，
 *   并注入 `src/client/palettes.ts` 的真实色标；
 * - 桌宠标记：与 `src/client/pet.tsx` 的渲染结果逐节点一致。
 *
 * 测的必须是线上那套字节，不能另写一份「差不多的」样式。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const outDir = join(here, '.out')
mkdirSync(outDir, { recursive: true })

/* ---------- 1. 桌宠 CSS ----------
   两套：pet.css 是仓库里的实时版本（改造后），pet-ref.css 是冻结的改造前基准。
   有了基准，改完之后仍能同机对照「改造前 vs 改造后」。 */
const petCss = readFileSync(join(repoRoot, 'src/client/pet.module.css'), 'utf8')
writeFileSync(join(outDir, 'pet.css'), petCss)
const petRefCss = readFileSync(join(here, 'reference/pet.module.css'), 'utf8')
writeFileSync(join(outDir, 'pet-ref.css'), petRefCss)

/* ---------- 2. 跑马灯 CSS（从 client/index.ts 抽模板） ---------- */
const indexSrc = readFileSync(join(repoRoot, 'src/client/index.ts'), 'utf8')
const start = indexSrc.indexOf('  return `', indexSrc.indexOf('function rainbowCss'))
const end = indexSrc.indexOf('`\n}', start)
if (start < 0 || end < 0) throw new Error('rainbowCss template not found in src/client/index.ts')
let rainbowCss = indexSrc.slice(start + '  return `'.length, end)

const palettesSrc = readFileSync(join(repoRoot, 'src/client/palettes.ts'), 'utf8')
const stops = {}
for (const m of palettesSrc.matchAll(/^\s*(\w+):\s*'([^']*)',/gm)) stops[m[1]] = m[2]

// 旋转图层的配色块（复制 ::before 的配色规则给 .rs-conic）
const paletteConicBlocks = Object.entries(stops)
  .map(([name, st]) => `html[data-rainbow-palette='${name}'] [data-composer-card] .rs-conic {\n  background: conic-gradient(from 0deg, ${st});\n}`)
  .join('\n')

const paletteBlocks = Object.entries(stops)
  .map(([name, s]) => `\n/* 配色方案：${name}。 */\nhtml[data-rainbow-palette="${name}"] [data-composer-card]::before {\n  background: conic-gradient(from var(--dsh-rainbow-angle), ${s});\n}`)
  .join('\n')

rainbowCss = rainbowCss.replace('${PALETTE_STOPS.rainbow}', stops.rainbow).replace('${paletteBlocks}', paletteBlocks)
writeFileSync(join(outDir, 'rainbow.css'), rainbowCss)

// 基准（改造前）的跑马灯样式：从冻结的 index.ts 里抽同一段模板。
const refIndexSrc = readFileSync(join(here, 'reference/index.ts'), 'utf8')
const refStart = refIndexSrc.indexOf('  return `', refIndexSrc.indexOf('function rainbowCss'))
const refEnd = refIndexSrc.indexOf('`\n}', refStart)
let refRainbowCss = refIndexSrc.slice(refStart + '  return `'.length, refEnd)
refRainbowCss = refRainbowCss.replace('${PALETTE_STOPS.rainbow}', stops.rainbow).replace('${paletteBlocks}', paletteBlocks)
writeFileSync(join(outDir, 'rainbow-ref.css'), refRainbowCss)

/* ---------- 3. 优化变体：旋转图层驱动跑马灯 ---------- */
const rainbowOpt = `/* 优化变体：旋转图层驱动跑马灯 —— 合成器接管 transform，每帧零重绘。
   只在 data-rs-mode="transform" 下接管，基线变体保持原样，否则对照就失真了。 */
html[data-rs-mode='transform'] [data-composer-card]::before { display: none !important; }

[data-composer-card] .rs-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: var(--dsh-rainbow-width, 2px);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  overflow: hidden;
}

/* 图层必须是**正方形**：扁矩形旋转后只覆盖中心附近的一个窄扇区，
   卡片左右会露出底层渐变（实测出现色相断层）。正方形的内切圆半径
   = 边长/2 = 卡片宽度 ≥ 卡片对角线的一半，任何角度都盖得住。
   居中用独立的 translate 属性，与 transform(rotate) 分开写，互不干扰。 */
[data-composer-card] .rs-conic {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 200%;
  aspect-ratio: 1 / 1;
  translate: -50% -50%;
  background: conic-gradient(from 0deg, ${stops.rainbow});
  animation: rs-spin var(--dsh-rainbow-period, 4s) linear infinite;
  animation-direction: var(--dsh-rainbow-direction, normal);
  will-change: transform;
}

@keyframes rs-spin {
  to { transform: rotate(360deg); }
}

/* 旋转图层的配色必须跟着「当前配色 / 当前状态」走——
   真实实现里要把 ::before 上那套配色规则复制一份给 .rs-conic，
   否则审批等待（琥珀）与出错（红）会退回彩虹色。 */
${paletteConicBlocks}
html[data-rainbow-state='attention'] [data-composer-card] .rs-conic {
  background: conic-gradient(from 0deg, #f59e0b, #fbbf24, #fcd34d, #f59e0b, #d97706, #f59e0b);
}

html[data-rainbow-state='error'] [data-composer-card] .rs-conic {
  background: conic-gradient(from 0deg, #ef4444, #f87171, #fca5a5, #ef4444, #dc2626, #ef4444);
}

/* 备选方案：静态锥形渐变 + hue-rotate 动画。
   旋转色轮 ≡ 色相旋转，视觉等价；不需要注入 DOM，图层也只有卡片大小。 */
html[data-rs-mode='hue'] [data-composer-card]::before {
  animation: rs-hue var(--dsh-rainbow-period, 4s) linear infinite;
  animation-direction: var(--dsh-rainbow-direction, normal);
}

@keyframes rs-hue {
  to { filter: hue-rotate(360deg); }
}
`
writeFileSync(join(outDir, 'rainbow-opt.css'), rainbowOpt)

/* ---------- 3b. 桌宠变体：把几何过渡换成合成属性过渡 ---------- */
/* 验证 F2 的成本归属：现状的表情几何靠 width/height/top/margin 过渡，
   每次换状态都在重排。这里只把「几何」从过渡列表里摘掉（颜色等保留），
   看 layout 次数掉多少——用来确认「126 次 layout」到底是谁造成的。 */
const petOpt = `/* 变体：几何过渡摘掉（颜色/透明度过渡保留）。 */
html[data-rs-pet='no-geo'] .eyeLeft,
html[data-rs-pet='no-geo'] .eyeRight,
html[data-rs-pet='no-geo'] .pupil,
html[data-rs-pet='no-geo'] .mouth {
  transition-property: transform, opacity, background-color, border-color, border-width, border-radius;
}
`
writeFileSync(join(outDir, 'pet-opt.css'), petOpt)

/* ---------- 4. 桌宠 DOM（与 pet.tsx 渲染结果一致） ---------- */
function petMarkup(state, reaction = '', ball = 'red') {
  const reactionAttr = reaction === ''
    ? ''
    : reaction.includes(':')
      ? ` data-${reaction.split(':')[0]}="${reaction.split(':')[1]}"`
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

const html = `<!doctype html>
<html lang="zh-CN" data-rainbow-palette="rainbow">
<head>
<meta charset="utf-8" />
<title>rainbowspeak 动画实测台</title>
<link id="css-pet" rel="stylesheet" href="pet.css" />
<link id="css-pet-ref" rel="stylesheet" href="pet-ref.css" disabled />
<link id="css-rainbow" rel="stylesheet" href="rainbow.css" />
<link id="css-rainbow-ref" rel="stylesheet" href="rainbow-ref.css" disabled />
<link rel="stylesheet" href="rainbow-opt.css" />
<link rel="stylesheet" href="pet-opt.css" />
<style>
  :root { --dsh-rainbow-width: 2px; --dsh-rainbow-period: 4s; --dsh-rainbow-direction: normal; }
  body { margin:0; padding:0; background:#f6f7f9; font-family: system-ui, sans-serif; }
  #stage { position:relative; width: 100vw; height: 100vh; }
  /* 宿主输入框卡片的稳定锚点 + 真实尺寸（画布大 → 锥形渐变重绘面积也大） */
  [data-composer-card] {
    position: absolute; left: 40px; top: 40px; width: 860px; height: 220px;
    border-radius: 22px; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.08);
    padding: 20px; box-sizing: border-box;
  }
  #pet-host { position:absolute; right: 40px; bottom: 40px; width:104px; height:104px; }
  #pet-host .pet { position:absolute; inset:0; }
</style>
</head>
<body>
<div id="stage">
  <div data-composer-card></div>
  <div id="pet-host">${petMarkup('resting')}</div>
</div>
<script src="bench.js"></script>
</body>
</html>
`
// 锚点写坏（属性名多了引号之类）会让整台对照静默失真——在这里就炸掉。
if (!/<div data-composer-card\s*>/.test(html)) {
  throw new Error('生成的页面缺少宿主锚点 <div data-composer-card>，对照会失真')
}
writeFileSync(join(outDir, 'index.html'), html)
// 运行时脚本与页面同目录（静态服务以 .out 为根）。
writeFileSync(join(outDir, 'bench.js'), readFileSync(join(here, 'bench.js'), 'utf8'))
console.log(`bench built → ${outDir}`)
console.log(`  pet.css ${petCss.length}B / rainbow.css ${rainbowCss.length}B`)
