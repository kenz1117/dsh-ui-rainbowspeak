# 动画性能与效果评估 · 升级方案

> 评估对象：`@kenz1117/dsh-ui-rainbowspeak` v0.3.0 —— 虹语跑马灯边框 + 桌宠「小虹」
> 评估日期：2026-10-29　　方法：源码走查 + headless Chromium 同机对照实测

---

## 一、结论摘要

**这个项目的动画「做得对」的部分，比「做得错」的多。** 桌宠的分工（三层 transform 归属：JS 拥有 `.motion` / CSS 拥有 `.body` / 瞳孔用变量驱动）、影子与身体的联动、状态优先级、随机入场、可测的纯函数拆分——这些都是能拿得出手的设计。

问题集中在三处，且**不是审美问题，是「动效跑在错误的渲染路径上」**：

| # | 问题 | 后果 | 级别 |
|---|---|---|---|
| 1 | 跑马灯用 `@property` 角度插值驱动 `conic-gradient` | 每帧重绘整张输入卡片（实测 360 次 Paint / 3 秒），主线程被拖住 | **P0** |
| 2 | 表情几何变化靠 `width/height/top/margin` 过渡 | 每次换状态触发 layout（实测 6 次切换 = 126 次；摘掉几何过渡后降到 8 次） | **P0** |
| 3 | 瞳孔跟随靠「写继承型 CSS 变量」 | 每帧让整棵桌宠子树重算样式（实测 240 次指针移动 ≈ 143–227 ms 纯重算） | **P0** |

外加两个「名不副实」的档位问题：`petMotion=off` 只停了 CSS 动画，**没停 JS 形变**（挤压回弹、拖拽摆动照跑）；`prefers-reduced-motion` 同样漏掉 JS 侧——无障碍语义有缺口。

**升级路线**：P0 全部改完「观感不变、每帧重绘归零」；P1 补动效语言统一与状态进出场；P2 动效回归测试。

---

## 二、评估方法

### 2.1 实测台

不靠「读代码猜性能」，搭了一套可复现的对照台：

- **真实样式**：桌宠样式直接内联 `src/client/pet.module.css`（36 KB 原文），跑马灯样式从 `src/client/index.ts` 的 `rainbowCss()` 模板抽取并注入真实色标（`src/client/palettes.ts`）——测的就是线上那套字节。
- **真实 DOM**：桌宠标记与 `pet.tsx` 的渲染结果逐节点一致（对照 `scripts/preview-pet.mjs`）。
- **真实热路径**：`pet.tsx` 里两条与动画性能相关的路径原样复刻——瞳孔跟随（rAF + 变量写入）与挤压回弹（rAF + transform 写入），常量与算法不变。
- **宿主替身**：输入框卡片按真实尺寸建模（860×220，圆角 22px），因为锥形渐变的重绘面积等于卡片面积，尺寸直接决定代价。
- **驱动**：headless Chromium + CDP（`Performance.getMetrics` + `Tracing`），Chrome 121+ 的 `Paint` / `RasterTask` / `UpdateLayoutTree` 事件。

### 2.2 对照组与变体

| 组 | 说明 |
|---|---|
| `control` | 空白页 —— 用来确认「指标地板」，防止把浏览器自身开销算到插件头上 |
| `baseline` | 现状 |
| `look-direct` | 瞳孔改为直接写 `transform`（不再写继承型变量） |
| `rainbow-tf` | 跑马灯改为「旋转图层」（`transform` 驱动） |
| `both` | 两项同改 |

每个变体重复 3 次取中位数；每个变体开跑前先自检「跑马灯真的在动」（否则等于没对照）。

### 2.3 口径与局限

- 数字来自 **headless Chromium**，走的是软件光栅路径，绝对值**不等于**真实 Electron 应用里的开销；结论看**同机相对差值**与**重绘次数**（次数与硬件无关）。
- 宿主应用（DSH）的真实 DOM、真实背景负载都不在台内，桌宠与宿主抢主线程的竞争无法在此复现。
- 帧间隔全部 16.67ms（60fps 满帧）——这台机器上两种实现都不掉帧，**所以问题不是「卡」，而是「白烧 CPU / 抢占主线程」**。在更弱的机器或宿主更忙时，这些每帧重绘就会变成真掉帧。

---

## 三、实测数据

以下是**改造完成之后**的最终对照：`ref` 是冻结的改造前基准（`tools/anim-bench/reference/`），`live` 是当前实现（同机、同一次运行，每项 3 次重复取中位数，窗口 3 秒）。

### 3.1 总表

| 指标 | control（空白页） | **ref（改造前）** | **live（改造后）** | 变化 |
|---|---|---|---|---|
| 跑马灯 **Paint 事件 / 3s** | 0 | **360**（= 每帧 2 次） | **0** | **−100%** |
| RasterTask / 3s | 0 | 360 | **0** | **−100%** |
| Paint 耗时 / 3s | — | **15.9 ms**（≈5.3 ms/s 主线程） | **0** | **−100%** |
| 每帧样式重算次数 / 3s | 0 | 180（60/s） | 180 | — |
| 空闲时的样式重算耗时 / 3s | 0 | 36.0 ms | **22.1 ms** | −39% |
| **指针扫动 240 次**的样式重算耗时 | — | **129 ms** | **66 ms** | **−49%** |
| 指针扫动的主线程总耗时 | — | 272 ms | **207 ms** | −24% |
| **换 6 次状态的 layout 次数** | — | **126** | **12** | **−90%** |
| 帧间隔均值 / 掉帧(>20ms) | — | 16.67 ms / 0 | 16.67 / 0 | — |

> **变体自检**（对照失效时数字就是假的，自检会把这种情况暴露出来）：`ref` 组的 `--dsh-rainbow-angle` 实测从 82.4° 走到 145.5°（4s/圈 → 700ms 应走 63°，实测 63.1° ✓），确认改造前的跑马灯真的在动；`live` 组 `::before` 的 `animation-name` 为 `none`、旋转图层矩阵在转 ✓。
>
> **归因交叉验证**：把「瞳孔跟随」单独退回旧的变量驱动（`live-look-var`），指针扫动的样式重算立刻回到 110 ms——**跑马灯与瞳孔这两项各自打掉的是不同的失效源**，效果可叠加。
>
> **跑数波动**：多次独立运行中，基线的「指针扫动样式重算」在 0.13–0.37 s 之间浮动，但**相对差值与排序始终稳定**。绝对值不要当真，相对值才是结论。
>
> 12 次 layout 是设计下限：拖拽态（「拎起来时的 o 嘴 / 瞪大眼」）刻意保留布局盒直改、不参与形变过渡，每次切换各留一次重排。

### 3.2 三个结论

**① 跑马灯是唯一在每帧重绘的东西。**

现状下 3 秒里产生 **362 次 Paint + 360 次 RasterTask**——60fps 下**每个动画帧重绘两次**。首个 Paint 事件的裁剪区是**整个视口（1440×813）**。换成旋转图层后：**Paint 归零、RasterTask 归零**。

其余动画（桌宠的呼吸、眨眼、高光漂移、光环、影子）**一轮 Paint 都不产生**——它们只动 `transform` / `opacity`，全部走合成器。这部分做得完全正确。

**② 指针扫动的样式重算能砍掉一半。**

240 次指针移动（≈2 秒）里：

- 改造前：**129 ms** 纯样式重算 + 272 ms 主线程总耗时；
- 改造后：**66 ms** 纯样式重算 + **207 ms** 主线程总耗时。

绝对值随机器与负载浮动，相对差值稳定在 −49% 上下（交叉验证见 §3.1）。

**③ 这台机器上不卡。**

所有变体的帧间隔都是 16.67 ms、掉帧 0 —— 满 60fps。**所以问题不是「卡」，是「白烧」**：每秒多花约 5.3 ms 主线程重绘 + 2 ms 光栅，外加每秒 60 次本不必要的样式重算。在宿主应用更忙、或机器更弱时，这些开销才会显形成掉帧；而且它抢的是**宿主自己的主线程**——桌宠在动，宿主的输入响应也在排队。


---

## 四、发现清单

### 4.1 性能类

#### F1 【P0】跑马灯每帧重绘整张卡片

**现状**（`src/client/index.ts:90-109`）

```css
[data-composer-card]::before {
  background: conic-gradient(from var(--dsh-rainbow-angle), …);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: dsh-rainbow-flow var(--dsh-rainbow-period) linear infinite;
}
@keyframes dsh-rainbow-flow { to { --dsh-rainbow-angle: 360deg; } }
```

`--dsh-rainbow-angle` 经 `@property` 注册成 `<angle>` 后可以插值，但**插值的是「渐变的角度参数」——每一帧都要重新光栅化整张锥形渐变**。而 `::before` 是 `inset: 0` 的整卡片尺寸，`mask` 只是「最后把中间挖掉」，**遮罩不缩小绘制面积**。

于是：卡片 860×220 = 189,200 px，每帧重绘一次；`breathe` 开启时再叠一条 opacity 动画；`attention` / `error` 状态各自又声明一份 `animation` 列表，切换状态时同样每帧重绘。

**行业做法**：让「流动」这件事由**合成器**承担，而不是由主线程重绘承担。渐变只画一次，之后靠 `transform` 搬运。

→ 方案与验证见 [§5 P0-1](#p0-1-跑马灯角度插值--旋转图层)；视觉等价验证脚本 `tools/anim-bench/verify-rainbow.mjs`。

#### F2 【P0】表情切换触发 layout

**现状**（`src/client/pet.module.css:214-217`）

```css
.eyeLeft, .eyeRight {
  transition: width .32s, height .32s, top .32s,
              border-color .32s, border-width .32s,
              border-radius .32s, background-color .32s;
}
```

`width / height / top / margin` 都是**布局属性**：过渡期间每帧重排。`.pupil` 过渡 `width/height/margin`、`.mouth` 过渡 `width/height/margin` 同理。

**归因已实测**：把「几何」从过渡列表里摘掉（颜色/透明度过渡保留），6 次状态切换的 layout 从 **126 次降到 8 次**——剩下 8 次是每次切换必然发生的那一次。**这 126 次 layout 完全来自几何过渡，没有别的来源。**

**但要说清楚量级**：这 126 次 layout 的总耗时只有 **13.6 µs**（桌宠是 `position: fixed` 的独立子树，layout 被限制在自己内部）。所以 F2 **不是实测出来的热点**，而是「顺手改对」的那一类：数字难看、机制不对。真正值得改的理由是——它让「表情切换」这条动画链永远绑在主线程的 layout 上，宿主应用越忙越吃亏，而改成 `transform` 之后同样的过渡完全在合成器里跑。

**行业做法**：几何变化一律走 `transform: scale() / translate()`，只动合成属性。

#### F3 【P0】瞳孔跟随让整棵子树重算样式

**现状**（`src/client/pet.tsx:296-301`）

```ts
element.style.setProperty('--pet-look-x', `${x.toFixed(2)}px`)
element.style.setProperty('--pet-look-y', `${y.toFixed(2)}px`)
```

变量写在 `.pet` 根上，而 `.pet` 的所有后代都**继承**这两个自定义属性。Chromium 对「继承型自定义属性变更」的处理是**让整个子树失效重算**——桌宠那 25 个节点每次指针移动都陪算一遍。

**实测**：240 次指针移动（2 秒）的纯样式重算耗时，现状 143 ms → 直接写 `transform` 64 ms（数字随机器与负载浮动，见 §3.1）。

**行业做法**：只写真正需要动的那几个元素的 `transform`（`.pupil` / `.glint` / `.glintDot`），失效范围从「整棵子树」缩到「3 个元素」。

#### F4 【P1】`will-change` 常驻

`src/client/pet.module.css:73` 与 `:107` 给 `.motion`、`.body` 常驻 `will-change: transform`。桌宠 24 小时挂在桌面上，两个永久合成层常驻显存。

**行业做法**：`will-change` 只在「马上要动」时加、动完摘掉；或者干脆不写——Chromium 对正在跑的 transform 动画会自动提升图层。

#### F5 【P1】三处 `clip-path` 与变换叠加

`src/client/pet.module.css:126 / 166 / 187` 对球面三层（`::before` / `.sheen` / `.rim`）各加一次 `clip-path: circle(50%)`。代码注释自己记了「裁剪加在带循环动画的本体上，缩放帧会把 rim 轮廓光栅化成球面缝线（实测）」——**这是裁剪路径与变换叠加导致的重光栅化接缝**。

**行业做法**：球面合成一层（一次裁剪 + 一次渐变堆叠），或用 `border-radius` + `overflow: hidden` 代替 `clip-path`。

#### F6 【P1】模糊光晕的重复模糊

`.aura` 的 `filter: blur(9px)`（`:82`）与 `.shadow` 的 `filter: blur(2px)`（`:367`）本身只在栅格化时算一次（transform 动画不触发重绘，这点做得对），但 `.aura` 还带 `transition: background .3s`（`:84`）——状态换色时整块模糊要重算一遍。

#### F7 【P2】`contain` 缺失

桌宠挂在宿主 `shell.overlay` 上，样式重算/布局会与宿主互相牵连。`contain: layout style`（**不加 `paint`**，否则气泡与菜单会被裁掉）可以把影响面圈在桌宠自己身上。

### 4.2 效果与体验类

#### E1 动效档位名不副实

`petMotion=off` 只把 `animation` 置空（`pet.module.css:1089-1106`），**漏掉了 `.eyeLeft/.eyeRight/.mouth/.blush/.bubble/.shadow` 的 transition**（`:1108-1113` 只覆盖了 `.pupil/.glint/.glintDot/.hit`）。用户选了「关」，表情仍然在 0.3s 里缓慢变形——**不是「不动」，是「动得更慢」**。

#### E2 JS 形变绕过了所有档位

`runSquash`（`pet.tsx:522-540`）与拖拽摆动（`pet.tsx:658-668`）直接写 `element.style.transform`：

- CSS 里的 `animation: none !important` 管不到内联 `transform`；
- `prefers-reduced-motion` 媒体查询（`:1410-1435`）也管不到；
- 所以「关」档与系统减弱动效下，**挤压回弹和惯性摆动照跑不误**。

顺带一个隐患：`.motion` 同时挂着 CSS 动画（入场 / 转圈）与 JS 内联 transform。**CSS 动画的优先级高于内联样式**，两者相遇时 JS 的那一份会被动画盖掉——戳击回弹可能被入场动画吞掉。

#### E3 渲染不纯

`pet.tsx:730` 与 `:738` 在 render 期间读 `Date.now()`：

```ts
const flashActive = flash !== null && Date.now() < flash.until
const showBubble = flashActive || hovered || Date.now() < bubbleUntil || …
```

`Date.now()` 不会触发重渲染 → 定时器到期后没有刷新源，气泡的显隐依赖「别的事件恰好引发一次渲染」。1 秒的状态轮询里 `setPetState` 在状态未变时会 bail out，**这条侥幸路径并不可靠**。

#### E4 悬挂定时器

`spawnHearts`（`pet.tsx:374-376`）自己 `setTimeout` 清理，没登记进 `timersRef`，组件卸载后仍会 `setState`。

#### E5 动效语言不成体系

现时长散落：挤压 420ms / 惊醒 620ms / 踉跄 720ms / 入场 760ms / 转圈 800ms / 庆祝 850ms / 摸摸 900ms / 伸懒腰 950ms，曲线有 `ease`、有 `ease-in-out`、有 `cubic-bezier(0.2, 0.9, 0.3, 1)`、有 `cubic-bezier(0.3, 0.9, 0.4, 1)`、有 `cubic-bezier(0.45, 0.05, 0.35, 1)`。

行业规范（Material 3 / Apple HIG）都会把「时长」与「缓动」抽成 token：短动作 100–200ms、中动作 200–350ms、长动作 350–500ms，配 2–3 条标准曲线。散落的数值不是错，但**新动画没有参照系**，久而久之手感会漂。

#### E6 状态切换没有「进出场」

表情是 CSS 属性直接跳变（靠 transition 兜着），没有「旧表情退场 → 新表情入场」的分段节奏。F2 改成 transform 之后，顺带可以做成分段：退场 120ms → 入场 180ms。

#### E7 `subtle` 档只做了一半

`pet.module.css:1115-1133` 只给 working / waiting / celebrating / stumble 做了收敛版，**resting / sleeping / 眨眼 / 光环 / 高光漂移仍是全量**。用户选「轻柔」时，球还在以全幅度呼吸。

#### E8 气泡长文案会溢出

`.bubble` 是 `white-space: nowrap` + `max-width: 220px`（`:381`、`:390`）。中文短句没问题，英文长句或未来更长的台词会直接顶出气泡。

### 4.3 做得好的地方（别改坏）

- **三层 transform 归属清晰**：JS 拥有 `.motion`（形变 / 摆动）、CSS 拥有 `.body`（状态动画）、瞳孔用变量驱动——注释把边界写清楚了，这是很多项目糊成一团的地方。
- **桌面宠宠物的动画全走合成属性**：状态动画只动 `transform` / `opacity`，实测**零 Paint 事件**（关掉跑马灯后，桌宠自己的动画一轮 Paint 都不产生）。这条做对了。
- **影子与身体联动**：跳跃时影子收、落地时影子摊——重量感的关键，很多桌宠做不到。
- **状态优先级**（等我 > 出错 > 庆祝 > 干活 > 打盹 > 待机）与 `noticeFromReason` 对「被取消 / token 触顶」的克制——报喜不撒谎。
- **`prefers-reduced-motion` 在 CSS 侧做了**（虽然漏了 JS 侧与部分 transition）。
- **纯函数拆分 + 随机源注入**（`pet-motion.ts`）：扫视、台词轮换、挤压曲线全部可测。
- **影子不随身体压扁**（`.shadow` 用 `scale` 不用 `scaleY`）——影子该变形的是面积不是形状。

---

## 五、升级方案

### P0 —— 观感不变，性能归零

#### P0-1 跑马灯：角度插值 → 旋转图层

把「渐变重绘」换成「图层旋转」：

```css
/* 环带载体：mask 留在这一层，形状永远不动 */
[data-composer-card] .rs-ring {
  position: absolute; inset: 0; border-radius: inherit;
  padding: var(--dsh-rainbow-width);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  overflow: hidden; pointer-events: none;
}
/* 色彩层：锥形渐变只画一次，之后交给合成器转 */
[data-composer-card] .rs-conic {
  position: absolute; left: 50%; top: 50%;
  width: 200%; aspect-ratio: 1 / 1;
  translate: -50% -50%;                       /* 独立属性，别和 rotate 混写 */
  background: conic-gradient(from 0deg, …);
  animation: rs-spin var(--dsh-rainbow-period) linear infinite;
}
@keyframes rs-spin { to { transform: rotate(360deg); } }
```

**关键坑：旋转图层必须是正方形。**
第一版方案把图层做成扁矩形（200% 于一个 860×220 的盒子 → 1720×440）。扁矩形绕中心旋转时，只有中心附近一个窄扇区被覆盖——卡片左右两端会露出底下的静态渐变，**实测出现 130° 的色相断层**（截图见 `tools/anim-bench/.out/shot-rainbow-tf.png` 的旧版）。正方形的内切圆半径 = 边长/2 ≥ 卡片对角线的一半，任何角度都盖得住。

**视觉等价已验证**（`node tools/anim-bench/verify-rainbow.mjs`）：两版各截一张图，把边框顶边 40 个采样点转成色相逐点求差——差值是**恒定相位**（均值 −0.04°、标准差 0.18°），逐点无漂移 → 视觉等价 ✓。

其余收益与代价：

- `reverse` 继续用 `animation-direction: reverse`；
- `data-rainbow-side`（顶/底/全边）继续用 mask 切，逻辑不变；
- **额外收益**：不再依赖 `@property` 支持——README 里那句「其他引擎显示静态环」的兼容限制可以取消，旋转是所有引擎的基本功；
- **代价**：要往卡片里注入两层 DOM → 用 `MutationObserver` 盯 `[data-composer-card]` 的出现与替换；
- **代价**：正方形图层边长 = 卡片宽度 ×2（860 → 1720），纹理显存约 11 MB。可接受（一个图层），但比现状多一块显存。

**备选（不注入 DOM）**：静态锥形渐变 + `filter: hue-rotate()` 动画。旋转色轮 ≡ 色相旋转，图层只有卡片大小、不用注入 DOM，彩虹配色下的视觉等价也过了同一套验证（色相差均值 −122°、标准差 10.8°——恒定相位偏移，偏移量来自截图时刻差）。

**但它在窄色相配色下是致命的，已实测**（`node tools/anim-bench/verify-palettes.mjs`，沿一个完整周期连续采样边框实际渲染出的色相）：

| 状态（配色） | 现状 | hue-rotate | **旋转图层** |
|---|---|---|---|
| 审批等待（琥珀） | 36–42°（琥珀） | **26°→320°，漂移 295°** ✗ | 36–42°，漂移 6° ✓ |
| 出错（红） | 0°（红） | **30°→345°，漂移 315°** ✗ | 0°，漂移 0° ✓ |

原因：琥珀与红**不是完整的色轮**，套一个色相旋转滤镜等于把整条色带转到别的色相去——琥珀会变成绿、蓝、紫。而**颜色在这套产品里是语义**：琥珀 = 「需要你点确认」，红 = 「出错」。滤镜把颜色转没了，信号就没了。旋转图层转的是「渐变本身」，琥珀还是琥珀 ✓

**结论：选旋转图层。** 代价是实现上要把配色规则复制一份给新的旋转图层：

```css
html[data-rainbow-palette='aurora'] .rs-conic { background: conic-gradient(from 0deg, …); }
/* 7 套配色各一条，外加 attention / error 两条状态规则 */
html[data-rainbow-state='attention'] .rs-conic { background: conic-gradient(from 0deg, #f59e0b, …); }
html[data-rainbow-state='error']    .rs-conic { background: conic-gradient(from 0deg, #ef4444, …); }
```

> 实测台里第一版旋转图层正是漏了这一步——审批等待时它显示成了彩虹的蓝紫色。**配色跟随是旋转图层方案最容易漏掉的一环。**

#### P0-2 表情几何：布局属性 → transform

- `.eyeLeft/.eyeRight`：把 `width/height/top` 过渡换成 `transform: scale()/translate()`，眼睛的尺寸变化改用 `scale`；
- `.pupil`：把 `width/height/margin` 过渡换成 `scale`；
- `.mouth`：把 `width/height/margin` 过渡换成 `scale` + `translate`；
- 状态切换时 `transform-origin` 需要逐状态给（眼睛中心、嘴底边），这一步要逐个状态核对视觉。

**实现时要注意一个坑**：眨眼动画 `pet-blink` 与庆祝的 `pet-happy` 都在眼睛上动 `transform: scaleY()`，会和几何用的 `transform` 抢同一个属性。可行的解法是几何走**独立变换属性** `scale`/`translate`（CSS 里 `translate → rotate → scale → transform` 依次合成），把 `transform` 留给眨眼——两者互不覆盖。眼睛的 `box-sizing` 也要补 `border-box`，否则 `working` 状态那圈 2px 镜框会让几何计算整体偏移 4px。

**实测依据**：几何过渡摘掉后，6 次状态切换的 layout 从 126 次降到 8 次（见 §3.1），说明这 126 次完全由几何过渡贡献。

#### P0-3 瞳孔跟随：变量 → 直接写 transform

`pet.tsx` 的 `writeLook` 改成直接写三个元素的 `transform`（`.pupil` / `.glint` / `.glintDot`），失效范围从整棵子树缩到 3 个元素。

> 注：CSS 里的 `transform: translate(var(--pet-look-x), var(--pet-look-y))` 保留不动即可——JS 写内联 `transform` 会覆盖它，视觉一致。

#### P0-4 档位与无障碍补齐

- `petMotion=off`：补齐 `.eyeLeft/.eyeRight/.mouth/.blush/.bubble/.shadow` 的 `transition: none`；
- `prefers-reduced-motion`：同样补齐；
- JS 侧：`runSquash`、拖拽摆动、指针跟随在「off 档」或系统减弱动效时**不启动**（在 JS 侧读同一个开关，而不是指望 CSS 兜住）。

#### P0-5 渲染纯度与定时器

- `Date.now()` 移出 render：改成 `flash`/`bubbleUntil` 到点后由定时器 `setState` 驱动显隐；
- `spawnHearts` 的 `setTimeout` 登记进 `timersRef`。

### P1 —— 观感升级

| 项 | 内容 |
|---|---|
| P1-1 动效 token | 在 `pet.module.css` 顶部定义 `--pet-dur-{fast,base,slow}` 与 `--pet-ease-{standard,emphasized,exit}`，把 14 处散落时长/曲线收编；参考 Material 3 的 emphasized 曲线 `cubic-bezier(0.2, 0, 0, 1)` |
| P1-2 状态进出场 | 配合 P0-2，换状态拆成「退场 120ms → 入场 180ms」两段，表情是「变过去」的而不是「跳过去」的 |
| P1-3 `subtle` 档补全 | resting / sleeping / 眨眼 / 光环 / 高光漂移全部收敛一档 |
| P1-4 气泡换行 | `white-space: normal` + `max-width: 220px`，长文案自动折行；顺带解决英文长句溢出 |
| P1-5 光晕去重模糊 | `.aura` 的 `transition: background` 改为只过渡 `opacity`，换色时不再整块重模糊 |

### P2 —— 工程化（可选）

| 项 | 内容 |
|---|---|
| P2-1 动效回归测试 | 用 Playwright 对六种状态 + 一次性反应截关键帧比对，防止改 CSS 时手感的无声退化（仓库已有 vitest，可并列加一条 playwright 任务） |
| P2-2 统一调度 | 用 Web Animations API 统一管理「可取消 / 可暂停 / 可查询」的动画，替掉 rAF + setTimeout 混用（`runSquash` 的 rAF 与 CSS 动画抢同一个 `transform` 的问题也随之消失） |
| P2-3 样式隔离 | `.pet` 加 `contain: layout style`（不加 `paint`），把宿主样式与重算影响圈在桌宠内部 |
| P2-4 `will-change` 按需 | 移除常驻声明，改为交互前加、结束后摘 |

---

## 六、验收方法

1. **回归**：`pnpm test`（vitest）+ `pnpm typecheck` + `pnpm bundle` 全绿；
2. **实测台复跑**（`pnpm bench:anim`）：改造后的样式灌进同一套 headless 台，要求
   - 跑马灯开着时 **Paint 事件 = 0**（3 秒窗口）——现状是 362；
   - 指针扫动 240 次的 `RecalcStyleDuration` 相比基线下降 ≥ 30%——现状 143 ms，优化后应 ≤ 100 ms；
   - 状态切换 6 次的 `LayoutCount` ≤ 8（摘掉几何过渡后的实测下限；现状 126）；
3. **视觉回归**：`preview/pet-states.html` 出图，与改前逐格比对（表情几何改成 transform 后，眼睛/嘴的比例会有微调，逐格确认）；
4. **跑马灯视觉等价**：`node tools/anim-bench/verify-rainbow.mjs` 必须判定「等价」（色相差为恒定相位，逐点无漂移）；
5. **配色语义不跑偏**：`node tools/anim-bench/verify-palettes.mjs` —— 审批等待必须始终是琥珀、出错必须始终是红（色相漂移 < 15°）；
6. **无障碍**：系统开启「减弱动态效果」后，桌宠应完全静止（含挤压回弹与拖拽摆动）；
7. **档位**：「关」档下表情应直接切换、无过渡。

---

## 附：实测台已固化进仓库

评估用的对照台已移入 `tools/anim-bench/`，可以随时复跑：

```bash
pnpm bench:anim        # 构建页面 + 跑四组变体 × 3 次重复
```

- `tools/anim-bench/build.mjs` —— 从仓库源码抽取真实样式与标记（桌宠 CSS 原文内联、跑马灯模板从 `client/index.ts` 抽、配色取自 `palettes.ts`）；
- `tools/anim-bench/bench.js` —— 复刻 `pet.tsx` 的两条动画热路径（瞳孔跟随 / 挤压回弹）；
- `tools/anim-bench/measure.mjs` —— CDP 驱动：指标 + tracing + **变体自检**（对照失效时数字就是假的，自检会把这种情况暴露出来）。

用法与局限见 `tools/anim-bench/README.md`。

**动画性能回归应该是可重复的，不该只靠一次性的手感判断**——这份评估的所有数字都可以用一条命令复现。


---

## 七、改造实施与结果

### 7.1 改了什么

| 项 | 改造前 | 改造后 |
|---|---|---|
| 跑马灯流动 | `@property` 角度插值（每帧重绘整张卡片） | **旋转图层**：`.rs-ring`（载体，只管遮罩）+ `.rs-conic`（色彩层，自转） |
| 跑马灯接线 | 纯 CSS | 新增 `src/client/rainbow-ring.ts`：注入两层 DOM + `MutationObserver` 跟着宿主的卡片重挂 |
| 跑马灯配色 | 一套配色规则 | 静态兜底与旋转图层各一份；**配色与状态必须跟着走**（琥珀/红是语义，不能被滤镜转走） |
| 表情几何 | `width/height/top/margin` 过渡 | `scale`/`translate` 过渡（逐状态换算，视觉对齐到亚像素） |
| 瞳孔跟随 | 写继承型 CSS 变量（整棵子树每帧失效） | 直接写 6 个元素的 `transform` |
| 形变归属 | JS 与 CSS 都写 `.motion` 的 transform（互相盖） | **分层**：`.motion`（CSS 入场/转圈）→ `.swing`（JS 摆动）→ `.squash`（WAAPI 回弹） |
| 挤压回弹 | rAF 逐帧写内联 transform | **Web Animations API**：可取消、可查询、不占主线程 |
| 档位与无障碍 | 只停 CSS 动画 | JS 形变一并停（`off` 档 + `prefers-reduced-motion`），并补齐漏掉的 transition |
| 渲染 | render 里读 `Date.now()`（显隐滞留） | 显隐由状态 + 定时器驱动 |
| 动效语言 | 14 处散落的时长与曲线 | **token**：时长三档 + 曲线三条，入场用带回弹的曲线 |
| 轻柔档 | 只收了几处，其余全量 | 待机/打盹/光环/高光/眨眼全收一档 |
| 气泡 | `nowrap`（长文案顶成长条） | `width: max-content` + `max-width` 封顶，长句在 220px 内折行 |
| 光环 | 过渡 `background`（逐帧重模糊） | 只过渡透明度（换色变瞬时，模糊只算一次） |
| 样式隔离 | 无 | `contain: layout style`（不加 `paint`——气泡与菜单要能溢出） |
| `will-change` | `.motion`/`.body` 常驻 | `.body` 保留（几乎一直在动），`.swing`/`.squash` 按需 |

### 7.2 视觉等价是怎么验的

改造动了表情的每个像素位置，所以「看起来一样」不能靠感觉。三道验证：

1. **几何盒逐个对照**：两版渲染后读取眼睛/瞳孔/嘴巴的 `getBoundingClientRect()`，逐状态对照。
   最终：working / waiting / error / sleeping 四态的眼睛与瞳孔盒**完全一致**（0.01px 级），嘴巴差异 ≤ 0.5px。
2. **整页逐像素比对**（`pnpm bench:refactor-visual`）：差异占比 **0.129%**、平均通道差 **0.53**——剩下的全是亚像素抗锯齿（1px 宽的白眼白边缘），1:1 观看不可辨。
   （气泡另有一轮单独核对：短句气泡改造前后同为 110×34，长句从「顶出 220px 上限的一行」变成「220px 内折两行」。）
3. **跑马灯的观感与语义**：
   - 观感（`verify-rainbow.mjs`）：改造前后的色相差是**恒定相位**（均值 2.6°、标准差 1.4°，即两次截图时刻差）→ 等价 ✓
   - 语义（`verify-palettes.mjs`）：审批等待全程稳定在琥珀（36–42°，漂移 6°）、出错全程稳定在红（漂移 0°）→ 颜色信号没被破坏 ✓

### 7.3 实施中撞到的四个真问题

写下来是因为它们都不是「读代码能看出来」的——四条都是「语义改对了，却踩到布局引擎的隐式规则」：

1. **Chromium 会把小数描边宽向下取整到整数像素**。`border: 1.714px` 实际渲染成 1px，导致第一版换算整体偏了 2px。解法：描边一律用整数 px，比例差用 scale 补。
2. **`translate` 属性的百分比基准是元素的布局盒（border box），不是缩放后的包围盒**。按包围盒换算会差 3–5px。
3. **被缩放的元素里，渐变会跟着变形**。镜片（白色眼白）是径向渐变，默认半径取「最远角」——盒宽一变，白核的形状就变（实测差 1px）。解法：渐变半径改用显式百分比。
4. **`overflow-wrap: anywhere` 会把绝对定位气泡的宽度压成一个字**。气泡改成可折行后，它竖成了一条（每个字一行）——因为 `anywhere` 会参与「最小内容宽度」的计算，绝对定位元素的收缩宽度就取了那个最小值。解法：气泡宽度改成 `width: max-content` + `max-width` 封顶，词内换行用 `break-word`（它不参与最小内容宽度计算）。

### 7.4 交付状态

- `pnpm test` 70 项全绿、`pnpm typecheck` 干净、`pnpm bundle` 通过；
- `pnpm bench:anim` / `pnpm bench:pet-visual` / `pnpm bench:refactor-visual` 三条命令可复现全部结论；
- 产品代码改动集中在：`src/client/index.ts`（跑马灯样式与接线）、`src/client/rainbow-ring.ts`（新）、`src/client/pet.tsx`（瞳孔直写、档位、渲染纯度、分层）、`src/client/pet.module.css`（几何 transform、动效 token、档位补全）。

### 7.5 发布

**0.4.0**（2026-10-30）：GitHub `main` + tag `v0.4.0`；npm `@kenz1117/dsh-ui-rainbowspeak@0.4.0`，`latest` 已指向它。真实安装验证：装到的产物含旋转图层实现、旧 `@property` 角度插值 0 处残留、node 半边可正常 require。

> npm 上的历史是 `0.0.1 / 0.0.2 / 0.1.0 / 0.4.0`——**0.2.x 与 0.3.0 只打了 git tag，从未发布到 npm**，所以 npm 用户是从 0.1.0 直接跳到 0.4.0（版本号有缺口，不影响安装）。
>
> 发布环境注意：本机 npm 走本地代理 `127.0.0.1:7897`，代理会把 `registry.npmjs.org` 重写到 **npmmirror 镜像**，而镜像同步有滞后——发布本身发往官方 registry（直连 API 已确认），但本地 `npm view` / `npm i` 在镜像同步前仍会看到旧的 `latest`。验证安装要绕开代理：`npm_config_proxy= npm i <pkg> --registry=https://registry.npmjs.org`。
