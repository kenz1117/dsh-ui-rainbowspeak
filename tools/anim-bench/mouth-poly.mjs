#!/usr/bin/env node
/**
 * 把 scan-faces-precise 的嘴部扫描线数据转成 CSS clip-path polygon()。
 * 数据来源：参考图逐像素实测（% 脸宽）。收缩量 = 抗锯齿环宽的一半。
 * 端头圆帽：参考图笔画是圆头，条带端头补若干半圆弧点（caps 个）。
 * 用法：node tools/anim-bench/mouth-poly.mjs
 */

const f = (v) => +v.toFixed(2)
const D = Math.PI / 180

const toPoly = (pts, x0, y0, w, h) =>
  `polygon(${pts.map(([x, y]) => `${f((x - x0) / w * 100)}% ${f((y - y0) / h * 100)}%`).join(',')})`

/** 由逐列 [x, yMin, yMax] 生成条带 polygon；caps = 两端各补几个半圆帽弧点。 */
function strip(cols, x0, y0, w, h, shrink, caps = 0) {
  const cs = cols
    .map(([x, a, b]) => [x, a + shrink, b - shrink])
    .filter(([, a, b]) => b > a)
  const pts = cs.map(([x, a]) => [x, a])
  for (let i = cs.length - 1; i >= 0; i--) pts.push([cs[i][0], cs[i][2]])
  if (!caps) return toPoly(pts, x0, y0, w, h)
  const [xl, al, bl] = cs[0]
  const cl = (al + bl) / 2, rl = (bl - al) / 2
  const [xr, ar, br] = cs[cs.length - 1]
  const cr = (ar + br) / 2, rr = (br - ar) / 2
  const right = []
  for (let i = 1; i <= caps; i++) {
    const th = (-90 + (180 * i) / (caps + 1)) * D
    right.push([xr + rr * Math.cos(th), cr + rr * Math.sin(th)])
  }
  const left = []
  for (let i = 1; i <= caps; i++) {
    const th = (90 + (180 * i) / (caps + 1)) * D
    left.push([xl + rl * Math.cos(th), cl + rl * Math.sin(th)])
  }
  return toPoly(pts.slice(0, cs.length).concat(right, pts.slice(cs.length), left), x0, y0, w, h)
}

/**
 * 笔画重建：平滑中心线 + 恒定厚度（两端收细）。
 * 原始 min/max 条带有 ±1px 抖动，局部反序会自交折叠（非零填充下
 * 多出细条伪影）；笔画重建后形状不变、拓扑干净。caps 同上（圆帽）。
 */
function strokeStrip(cols, x0, y0, w, h, shrink, caps = 0) {
  const cs = cols.map(([x, a, b]) => [x, a + shrink, b - shrink]).filter(([, a, b]) => b > a)
  const c = cs.map(([x, a, b]) => [x, (a + b) / 2])
  const sm = c.map(([x, v], i) => {
    const p = c[Math.max(0, i - 1)][1], n = c[Math.min(c.length - 1, i + 1)][1]
    return [x, (p + 2 * v + n) / 4]
  })
  const th = cs.map(([, a, b]) => b - a).sort((x, y) => x - y)
  const t = th[(th.length / 2) | 0]
  const n = sm.length
  const k = (i) => (i < 2 ? 0.45 + 0.275 * i : i > n - 3 ? 0.45 + 0.275 * (n - 1 - i) : 1)
  const pts = []
  for (const [x, y] of sm) pts.push([x, y - (t * k(pts.length)) / 2])
  for (let i = n - 1; i >= 0; i--) pts.push([sm[i][0], sm[i][1] + (t * k(i)) / 2])
  if (!caps) return toPoly(pts, x0, y0, w, h)
  const head = sm[0], tail = sm[n - 1]
  const rh = (t * k(0)) / 2, rt = (t * k(n - 1)) / 2
  const right = []
  for (let i = 1; i <= caps; i++) {
    const th = (-90 + (180 * i) / (caps + 1)) * D
    right.push([tail[0] + rt * Math.cos(th), tail[1] + rt * Math.sin(th)])
  }
  const left = []
  for (let i = 1; i <= caps; i++) {
    const th = (90 + (180 * i) / (caps + 1)) * D
    left.push([head[0] + rh * Math.cos(th), head[1] + rh * Math.sin(th)])
  }
  return toPoly(pts.slice(0, n).concat(right, pts.slice(n), left), x0, y0, w, h)
}

/* —— 粉粉 ω 波浪嘴（参考 loose 描迹，shrink 0.4 去 AA）——
   元素盒 x41.2 y59.8 23.4×7.7 */
const pinkCols = [
  [41.32,63.22,64.05],[42.15,62.4,65.29],[42.98,62.4,66.12],[43.8,62.81,66.53],
  [44.63,64.05,66.94],[45.45,64.46,67.36],[46.28,64.46,67.36],[47.11,64.46,66.94],
  [47.93,63.64,66.94],[48.76,62.4,66.53],[49.59,61.16,65.7],[50.41,60.74,64.88],
  [51.24,60.33,63.64],[52.07,60.33,64.05],[52.89,60.33,63.64],[53.72,60.74,64.46],
  [54.55,61.16,64.88],[55.37,62.4,65.29],[56.2,62.81,65.7],[57.02,63.22,65.7],
  [57.85,63.22,65.7],[58.68,63.22,65.7],[59.5,62.81,65.7],[60.33,62.81,65.7],
  [61.16,61.57,65.29],[61.98,60.33,64.88],[62.81,59.92,64.05],[63.64,59.92,63.22],
  [64.46,60.74,61.16],
]

/* —— 绿绿 折线嘴（core 描迹，shrink 0.25）——
   元素盒 x36.9 y50.1 35.7×10.1 */
const greenCols = [
  [37.04,58.44,59.26],[37.86,57.61,60.08],[38.68,57.2,60.08],[39.51,57.2,59.67],
  [40.33,57.2,59.67],[41.15,56.79,59.26],[41.98,56.79,59.26],[42.8,56.38,58.85],
  [43.62,56.38,58.85],[44.44,55.97,58.44],[45.27,55.97,58.44],[46.09,55.56,58.02],
  [46.91,55.56,58.02],[47.74,55.14,57.61],[48.56,55.14,57.61],[49.38,54.73,57.2],
  [50.21,54.73,58.02],[51.03,54.73,57.2],[51.85,55.14,57.61],[52.67,55.14,58.02],
  [53.5,55.14,58.44],[54.32,55.97,58.44],[55.14,55.97,58.85],[55.97,56.38,58.85],
  [56.79,56.38,59.26],[57.61,55.56,59.26],[58.44,54.73,58.44],[59.26,53.5,57.2],
  [60.08,52.67,56.38],[60.91,52.26,55.56],[61.73,51.85,54.73],[62.55,51.85,54.32],
  [63.37,51.85,53.91],[64.2,50.62,53.91],[65.02,50.62,53.5],[65.84,50.21,53.5],
  [66.67,51.44,53.09],[67.49,50.21,53.09],[68.31,50.21,52.67],[69.14,50.62,52.67],
  [69.96,50.62,51.85],[70.78,50.21,52.67],[71.6,50.21,52.26],[72.43,50.62,52.26],
]

/* —— 黄黄 白笑口（white strict 描迹，shrink 0.3）——
   元素盒 x42.4 y57.5 18.95×11.2 */
const yellowCols = [
  [42.45,57.55,64.49],[43.27,57.55,65.71],[44.08,57.55,66.53],[44.9,57.55,67.35],
  [45.71,57.96,67.76],[46.53,58.37,68.16],[47.35,58.37,68.57],[48.16,58.37,68.57],
  [48.98,58.78,67.76],[49.8,58.78,68.16],[50.61,58.78,68.16],[51.43,58.78,68.57],
  [52.24,58.78,68.57],[53.06,58.78,68.57],[53.88,58.78,68.16],[54.69,58.78,68.16],
  [55.51,58.37,68.57],[56.33,57.96,68.57],[57.14,57.55,68.57],[57.96,57.55,68.16],
  [58.78,57.96,67.76],[59.59,57.55,66.94],[60.41,57.55,65.71],[61.22,57.96,64.49],
]

const pct = (x, y, x0, y0, w, h) => `${f((x - x0) / w * 100)}% ${f((y - y0) / h * 100)}%`

console.log('/* 粉粉嘴 元素盒: x41.2 y59.8 w23.4 h7.7 */')
console.log('--mouth-clip: ' + strip(pinkCols, 41.2, 59.8, 23.4, 7.7, 0.4, 4))
console.log('\n/* 绿绿嘴 元素盒: x36.9 y50.1 w35.7 h10.1 */')
console.log('--mouth-clip: ' + strokeStrip(greenCols, 36.9, 50.1, 35.7, 10.1, 0.25, 4))
console.log('\n/* 黄黄白嘴 元素盒: x42.4 y57.5 w18.95 h11.2 */')
console.log('--mouth-clip: ' + strip(yellowCols, 42.4, 57.5, 18.95, 11.2, 0.3, 4))

/* —— 红红 实心尖角+横杠（手工多边形，来自 rows/cols 实测）——
   元素盒 x37.45 y58.85 20.9×6.6；横杠右端与尖端补圆帽。 */
const redBase = [
  [37.45, 63.4], [43.6, 58.9], [44.4, 62.1], [58.3, 62.1],
]
const redRight = []
for (let i = 1; i <= 4; i++) {
  const th = (-90 + (180 * i) / 5) * D
  redRight.push([58.3 + 1.65 * Math.cos(th), 63.75 + 1.65 * Math.sin(th)])
}
const redTip = []
for (let i = 1; i <= 3; i++) {
  const th = (120 + (120 * i) / 4) * D
  redTip.push([37.45 + 0.9 * Math.cos(th), 64.3 + 0.9 * Math.sin(th)])
}
const red = redBase.concat(redRight, [[58.3, 65.4], [37.7, 65.2]], redTip)
console.log('\n/* 红红嘴 元素盒: x37.45 y58.85 w20.9 h6.6 */')
console.log('clip-path: polygon(' + red.map(([x, y]) => pct(x, y, 37.45, 58.85, 20.9, 6.6)).join(',') + ')')

/* —— 蓝蓝 V 嘴（顶点/帽心实测）——
   元素盒 x45.9 y56.4 11.7×6.5 */
const blue = [
  [47.4, 56.9], [48.9, 57.4], [51.7, 62.6], [54.4, 57.7], [55.9, 57.5], [56.6, 58.4],
  [55.1, 59.8], [51.7, 59.2], [48.1, 59.0],
]
console.log('\n/* 蓝蓝V嘴 元素盒: x45.9 y56.4 w11.7 h6.5 */')
console.log('clip-path: polygon(' + blue.map(([x, y]) => pct(x, y, 45.9, 56.4, 11.7, 6.5)).join(',') + ')')
