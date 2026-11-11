#!/usr/bin/env node
/**
 * 生成柔光预览页：preview/glow.html
 *
 * 柔光是纯 CSS 效果，真实渲染要连整个宿主跑起来；预览页取**构建产物**
 * lib/client.js 里的 rainbowCss 真身（不是重新拼一份），保证预览与宿主
 * 渲染一字不差。产物是 window.__ModuleLoader__.load 包裹的闭包工厂，
 * 这里给宿主 loader 打最小 shim 取出导出。
 *
 * 页面两部分：
 * - 控制台（大卡片，暗色 + 浅色两个舞台）：开关/配色/位置/状态/呼吸/反向/
 *   宽度滑杆 + 柔光三常量（extent/blur/opacity）实时调参——截图调参用；
 * - 矩阵（iframe 小格，各带独立 html 属性）：开关前后对比 / 七配色 /
 *   四状态 / 三位置 / 四档宽度，一屏看全。
 *
 * mock 卡片的注入层结构与 rainbow-ring.ts 的 attach 保持一致
 * （先 .rs-glow > .rs-glow-band，后 .rs-ring > .rs-conic；改注入结构时同步改这里）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(repoRoot, 'lib/client.js')
const outDir = join(repoRoot, 'preview')
const outPath = join(outDir, 'glow.html')

/**
 * 执行闭包工厂产物，取回 client 导出。
 * 产物顶层是一个表达式语句（window.__ModuleLoader__.load({...})），
 * 平台模块经工厂入参 require，模块成员要到渲染期才解引用——嵌套 Proxy 桩即可。
 * @returns client 导出（apply / inject / rainbowCss）。
 */
function loadClientExports() {
  const captured = []
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (def) => { captured.push(def) } } }
  try {
    new Function(readFileSync(bundlePath, 'utf8'))()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  const def = captured.at(-1)
  if (def === undefined) throw new Error(`no module registered from ${bundlePath}`)
  const stub = new Proxy(function stub() {}, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => 'stub' : stub),
    apply: () => stub,
  })
  return def.factory(() => stub)
}

const { rainbowCss } = loadClientExports()
if (typeof rainbowCss !== 'function') {
  throw new Error('lib/client.js does not export rainbowCss — run pnpm bundle first')
}
const css = rainbowCss()

/** theme 配色在宿主里取的品牌蓝变量，预览环境不存在，给个近似值让它能渲。 */
const THEME_BLUE = '#4d6bfe'

/** 注入层标记：与 rainbow-ring.ts attach 的 DOM 一致（glow 在 ring 之前）。 */
const LAYERS = '<div class="rs-glow"><div class="rs-glow-band"></div></div><div class="rs-ring"><div class="rs-conic"></div></div>'

/** mock 卡片（fill 模拟输入区底色，先于注入层，与真实卡片子顺序一致；
 *  rs-has-ring 对应 rainbow-ring 注入后的状态，让 ::before 静态兜底退场）。 */
const CARD = (extraAttrs = '') => `<div class="card rs-has-ring" data-composer-card ${extraAttrs}><div class="fill"></div>${LAYERS}</div>`

/** 卡片与舞台的页面级样式（独立于 rainbowCss，名字避开 rs- 前缀）。 */
const PAGE_CSS = `
:root { --dsw-alias-button-info-fill: ${THEME_BLUE}; }
html, body { margin: 0; }
body {
  font: 13px/1.6 system-ui, -apple-system, 'PingFang SC', sans-serif;
  background: #0d1117;
  color: #d7dde5;
  padding-bottom: 48px;
}
.controls {
  position: sticky; top: 0; z-index: 10;
  display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
  padding: 10px 16px;
  background: #0d1117ee; backdrop-filter: blur(8px);
  border-bottom: 1px solid #2a323d;
}
.controls label { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.controls select, .controls input[type='range'] { accent-color: ${THEME_BLUE}; }
.controls .grow { flex: 1; }
.stage { padding: 44px 40px 12px; }
.stage h2 { margin: 0 0 18px; font-size: 14px; font-weight: 600; color: #9aa7b5; }
.stage .cards { display: flex; gap: 48px; flex-wrap: wrap; align-items: flex-start; }
.stage-light { background: #eef1f5; color: #333a44; }
.stage-light h2 { color: #66707d; }
.card {
  position: relative;
  width: 480px; height: 64px;
  border-radius: 14px;
  background: #1b2129;
  box-shadow: 0 6px 24px #0006;
}
.stage-light .card { background: #ffffff; box-shadow: 0 6px 18px #0002; }
.card .fill { position: absolute; inset: 10px 14px; border-radius: 9px; background: #242c36; }
.stage-light .card .fill { background: #f2f4f8; }
.matrix { padding: 8px 40px 0; }
.matrix h2 { font-size: 14px; font-weight: 600; color: #9aa7b5; margin: 28px 0 10px; }
.tiles { display: flex; flex-wrap: wrap; gap: 14px; }
.tile { display: flex; flex-direction: column; gap: 6px; }
.tile iframe { width: 300px; height: 110px; border: 1px solid #2a323d; border-radius: 10px; background: #0d1117; }
.tile span { font-size: 12px; color: #9aa7b5; }
`

/**
 * 一块矩阵小格：iframe srcdoc 内联同一份 rainbowCss 与独立 html 属性。
 * 属性值做纯 HTML 实体转义（& 引号），解析时还原成完整文档——
 * 不能用 JSON.stringify，外层引号会变成文档首字符，整篇被当纯文本渲染。
 * @param label - 格子标签。
 * @param htmlAttrs - 挂在 iframe 内 <html> 上的 data 属性串。
 * @param extraCardStyle - 卡片局部变量覆盖（如不同宽度）。
 * @returns iframe 标记。
 */
function tile(label, htmlAttrs, extraCardStyle = '') {
  const doc = `<!doctype html><html ${htmlAttrs}><head><meta charset="utf-8"><style>${css}
:root { --dsw-alias-button-info-fill: ${THEME_BLUE}; }
html, body { margin: 0; height: 100%; }
body { display: flex; align-items: center; justify-content: center; background: #0d1117; }
.card { position: relative; width: 76%; height: 56px; border-radius: 12px; background: #1b2129; }
.card .fill { position: absolute; inset: 9px 12px; border-radius: 8px; background: #242c36; }
${extraCardStyle}</style></head><body>${CARD()}</body></html>`
  const attrValue = doc.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  return `<div class="tile"><iframe loading="lazy" title="${label}" srcdoc='${attrValue}'></iframe><span>${label}</span></div>`
}

/** 控制台交互脚本：html 属性开关 + 内联变量调参。 */
const CONTROLS_JS = `
const root = document.documentElement
const setAttr = (id, attr) => {
  const el = document.getElementById(id)
  el.addEventListener('change', () => {
    if (el.value) root.dataset[attr] = el.value
    else delete root.dataset[attr]
  })
}
document.getElementById('glow').addEventListener('change', (e) => {
  if (e.target.checked) root.dataset.rainbowGlow = '1'; else delete root.dataset.rainbowGlow
})
setAttr('palette', 'rainbowPalette')
setAttr('side', 'rainbowSide')
setAttr('state', 'rainbowState')
document.getElementById('breathe').addEventListener('change', (e) => {
  if (e.target.checked) root.dataset.rainbowBreathe = '1'; else delete root.dataset.rainbowBreathe
})
const bindVar = (id, cssVar, unit = '') => {
  const el = document.getElementById(id)
  const out = document.getElementById(id + '-out')
  const apply = () => {
    root.style.setProperty(cssVar, el.value + unit)
    out.textContent = el.value + unit
  }
  el.addEventListener('input', apply)
  apply()
}
bindVar('width', '--dsh-rainbow-width', 'px')
bindVar('period', '--dsh-rainbow-period', 's')
bindVar('extent', '--dsh-rainbow-glow-extent', 'px')
bindVar('blur', '--dsh-rainbow-glow-blur', 'px')
bindVar('opacity', '--dsh-rainbow-glow-opacity')
document.getElementById('reverse').addEventListener('change', (e) => {
  root.style.setProperty('--dsh-rainbow-direction', e.target.checked ? 'reverse' : 'normal')
})
document.getElementById('celebrate').addEventListener('click', () => {
  root.dataset.rainbowCelebrate = '1'
  setTimeout(() => { delete root.dataset.rainbowCelebrate }, 950)
})
document.getElementById('reset').addEventListener('click', () => {
  for (const v of ['--dsh-rainbow-width', '--dsh-rainbow-period', '--dsh-rainbow-direction', '--dsh-rainbow-glow-extent', '--dsh-rainbow-glow-blur', '--dsh-rainbow-glow-opacity']) root.style.removeProperty(v)
  location.reload()
})
`

const GLOW_ON = 'data-rainbow-glow="1"'
const PAL = (name) => `${GLOW_ON} data-rainbow-palette="${name}"`

/** 矩阵：开关对比 / 七配色 / 四状态 / 三位置 / 四档宽度。 */
const tiles =
  tile('关（对照）', '') + tile('开（默认参数）', GLOW_ON)
  + Object.entries({ rainbow: '经典彩虹', aurora: '极光', sunset: '日落', peach: '蜜桃', ocean: '海洋', cyberpunk: '赛博', theme: '跟随主题' })
    .map(([name, label]) => tile(label, PAL(name))).join('')
  + tile('运行中', `${GLOW_ON} data-rainbow-state="running"`)
  + tile('等待审批', `${GLOW_ON} data-rainbow-state="attention"`)
  + tile('出错', `${GLOW_ON} data-rainbow-state="error"`)
  + tile('仅顶边', `${GLOW_ON} data-rainbow-side="top"`)
  + tile('仅底边', `${GLOW_ON} data-rainbow-side="bottom"`)
  + [1, 2, 4, 6].map((w) => tile(`宽度 ${w}px`, GLOW_ON, `.card { --dsh-rainbow-width: ${w}px; }`)).join('')

const page = `<!doctype html>
<html lang="zh" ${GLOW_ON}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RainbowSpeak 柔光预览（默认 extent 14px / blur 5px / opacity 0.6）</title>
<style>
${css}
${PAGE_CSS}
</style>
</head>
<body>
<div class="controls">
  <label><input type="checkbox" id="glow" checked> 柔光</label>
  <label>配色 <select id="palette">
    <option value="rainbow">经典彩虹</option><option value="aurora">极光</option>
    <option value="sunset">日落</option><option value="peach">蜜桃</option>
    <option value="ocean">海洋</option><option value="cyberpunk">赛博</option>
    <option value="theme">跟随主题</option>
  </select></label>
  <label>位置 <select id="side">
    <option value="all">四边</option><option value="top">仅顶边</option><option value="bottom">仅底边</option>
  </select></label>
  <label>状态 <select id="state">
    <option value="">常态</option><option value="running">运行</option>
    <option value="attention">等待</option><option value="error">出错</option>
  </select></label>
  <label><input type="checkbox" id="breathe"> 呼吸</label>
  <label><input type="checkbox" id="reverse"> 反向</label>
  <button type="button" id="celebrate">庆祝一下</button>
  <label class="grow">宽度 <input type="range" id="width" min="1" max="6" step="1" value="2"> <output id="width-out"></output></label>
  <label>流速 <input type="range" id="period" min="1" max="10" step="1" value="4"> <output id="period-out"></output></label>
  <label>extent <input type="range" id="extent" min="4" max="40" step="1" value="14"> <output id="extent-out"></output></label>
  <label>blur <input type="range" id="blur" min="0" max="20" step="0.5" value="5"> <output id="blur-out"></output></label>
  <label>opacity <input type="range" id="opacity" min="0.05" max="1" step="0.05" value="0.6"> <output id="opacity-out"></output></label>
  <button type="button" id="reset">重置</button>
</div>

<section class="stage stage-dark">
  <h2>暗色舞台（柔光的主场：硬边过渡在这里最明显）</h2>
  <div class="cards">${CARD()}${CARD()}</div>
</section>

<section class="stage stage-light">
  <h2>浅色舞台（检查光晕是否过曝/发灰）</h2>
  <div class="cards">${CARD()}</div>
</section>

<section class="matrix">
  <h2>矩阵（开关对比 · 七配色 · 状态 · 位置 · 宽度）</h2>
  <div class="tiles">${tiles}</div>
</section>

<script>
${CONTROLS_JS}
</script>
</body>
</html>
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, page)
console.log(`wrote ${outPath} (${(page.length / 1024).toFixed(1)} KiB, css ${(css.length / 1024).toFixed(1)} KiB)`)
