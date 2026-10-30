# 动画性能实测台

动画性能不该只靠「看一眼顺不顺」。这套台子把当前实现与优化变体放在**同一台机器、同一个浏览器进程**里对照，用 CDP 采真实指标：

- `Performance.getMetrics` —— 主线程耗时、样式重算耗时与次数、layout 次数；
- `Tracing` —— `Paint` / `RasterTask` / `UpdateLayoutTree` 事件，回答「这一帧到底重绘了几次」。

## 用法

```bash
pnpm bench:anim            # 构建页面 + 跑四组变体 × 3 次重复
# 结果写入 tools/anim-bench/.out/results.json
```

需要本机有 Chrome；非标准路径用环境变量指定：

```bash
CHROME_PATH=/usr/bin/chromium pnpm bench:anim
```

## 它测的是什么

页面**不是另写一份「差不多的」样式**——`build.mjs` 从仓库源码里抽取：

| 来源 | 用途 |
|---|---|
| `src/client/pet.module.css` | 桌宠样式，原文照抄 |
| `src/client/index.ts` 的 `rainbowCss()` | 跑马灯样式，注入真实色标 |
| `src/client/palettes.ts` | 配色色标 |
| `src/client/pet.tsx` 的 DOM 结构 | 桌宠标记 |

运行时（`bench.js`）复刻了 `pet.tsx` 里与动画性能相关的两条热路径——**瞳孔跟随**（rAF + 变量写入）与**挤压回弹**（rAF + transform 写入），常量与算法与源码一致。

## 四个变体

| 变体 | 含义 |
|---|---|
| `control` | 空白页：确认指标地板，防止把浏览器自身开销算到插件头上 |
| `baseline` | 现状 |
| `look-direct` | 瞳孔改为直接写 `transform`（不再写继承型 CSS 变量） |
| `rainbow-tf` | 跑马灯改为旋转图层（`transform` 驱动，合成器接管） |
| `rainbow-hue` | 跑马灯改为静态渐变 + `hue-rotate`（不注入 DOM 的备选） |
| `pet-no-geo` | 桌宠表情的几何过渡摘掉（颜色过渡保留），用于归因 layout |
| `both` / `both-no-geo` | 上述改动叠加 |

每个变体跑之前会**自检**：确认基线组的 `--dsh-rainbow-angle` 真的在插值、变体组的旋转图层真的在转。对照一旦失效，数字就是假的。

## 视觉等价验证

```bash
node tools/anim-bench/verify-rainbow.mjs
```

把两版跑马灯各截一张图，读出边框上 40 个采样点的色相逐点求差：

- 差值是**恒定相位**（两版截图时刻不同带来的）→ 视觉等价 ✓
- 差值随位置系统性漂移 → 几何对不上，方案不能用

这一步抓到过一个真问题：旋转图层最初做成扁矩形，旋转后只盖住中心附近的窄扇区，卡片左右露出底层渐变，**实测出现 130° 色相断层**——改成正方形（`aspect-ratio: 1`）才解决。截图会存到 `.out/shot-*.png`。

### 配色语义验证

```bash
node tools/anim-bench/verify-palettes.mjs
```

沿一个完整周期连续采样边框**实际渲染出来的色相**，看颜色会不会随动画相位漂移。

这一关否掉了 `hue-rotate` 方案：审批等待的琥珀会漂移 295°（转成绿/蓝/紫），出错的红会漂移 315°。颜色在这套产品里是语义（琥珀 = 等你确认，红 = 出错），不能让滤镜把它转没了。

同时它也抓到旋转图层方案最容易漏的一环：**旋转图层的渐变必须跟着当前配色与状态走**，否则审批等待时会退回彩虹色。

## 怎么读结果

看**同机相对差值**与**重绘次数**（次数与硬件无关），别看绝对毫秒数——headless 走的是软件光栅路径，绝对值不等于真实 Electron 应用里的开销。

## 局限

- 台内没有宿主的真实 DOM 与背景负载，**桌宠与宿主抢主线程的竞争无法复现**；
- 只测「消耗」，不测「观感」——观感靠 `preview/pet-states.html` 逐格比对。

详见 `docs/animation-audit.md`。
