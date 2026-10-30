<div align="center">

# dsh-ui-rainbowspeak

<p align="center"><b>虹语</b> RainbowSpeak — 一圈会流动的彩虹边框，外加一只住在窗口里的吧唧球桌宠「小虹」：五颗糖果球随你挑（红黄粉蓝绿），按参考图逐像素复刻，会看你的指针、等你点确认、只在该庆祝时庆祝。</p>

<p align="center">
  <a href="https://github.com/kenz1117/dsh-ui-rainbowspeak/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/kenz1117/dsh-ui-rainbowspeak?logo=github"></a>
  <a href="https://www.npmjs.com/package/@kenz1117/dsh-ui-rainbowspeak"><img alt="npm version" src="https://img.shields.io/npm/v/@kenz1117/dsh-ui-rainbowspeak?logo=npm"></a>
  <a href="https://www.npmjs.com/package/@kenz1117/dsh-ui-rainbowspeak"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@kenz1117/dsh-ui-rainbowspeak?logo=npm"></a>
  <a href="https://github.com/kenz1117/dsh-ui-rainbowspeak/blob/main/LICENSE"><img alt="License MIT" src="https://img.shields.io/github/license/kenz1117/dsh-ui-rainbowspeak"></a>
  <a href="https://github.com/kenz1117/dsh-ui-rainbowspeak/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen"></a>
  <a href="https://github.com/kenz1117/dsh-ui-rainbowspeak"><img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/kenz1117/dsh-ui-rainbowspeak?logo=github"></a>
  <a href="https://github.com/kenz1117/dsh-ui-rainbowspeak/graphs/contributors"><img alt="GitHub contributors" src="https://img.shields.io/github/contributors/kenz1117/dsh-ui-rainbowspeak"></a>
  <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
</p>

[中文](README.md) · [English](README.en.md)

</div>

---

<img width="1271" height="811" alt="image" src="https://github.com/user-attachments/assets/16fbd528-3d17-47de-aa87-3e0f768cfdf8" />


## ✨ 为什么选它

### 纯装饰，零侵入

不接管任何插槽、不打宿主补丁、不注册工具、不注入系统提示。彩虹环是纯浏览器端装饰：一条 `conic-gradient` 圆环经蒙版只留卡片边缘，由**旋转图层**承载流动——渐变只画一次，之后交给合成器转，主线程不再为它每帧重绘。

桌宠也遵守同一条边界：宿主侧只多了一条**只读**的回合边界流（会话身份 + 回合序号 + 结束原因），**不携带任何聊天内容、历史或审批细节**；浏览器侧只往 `shell.overlay` 挂一个浮动条目，不改宿主的任何既有界面。

### 五颗球，五套形象，逐像素复刻

五颗球**不是**一个角色的五种配色——是五个独立角色：红红（傲娇冷面）、黄黄（慵懒半垂眼）、粉粉（憨萌大眼）、蓝蓝（理性眼镜）、绿绿（暴躁斗眼）。每个角色的脸都按参考图**逐像素实测复刻**（`tools/anim-bench/scan-faces-precise.mjs` 连通域 + 扫描线测量，部件误差 ≤0.5% 脸宽）：底色纯平涂、嘴形是扫描线生成的 clip-path 多边形、黄球「白眼球 + 红半圆盖」双层眼、蓝球镜框随体型缩放。球形几何有 `longhand + !important` 加固合同，宿主全局样式改不动它。

小虹的**成功与失败以宿主的回合边界为准**（经 Typert 远端读 `session/event` 的 `turn/end`）：被取消的一轮不会报喜，报喜是撒谎。远端不可用时它只依据客户端会话状态做「在跑 / 在等你」的表情，安静降级，不编造结论。

### 会互动的小虹

- **眼睛跟着指针走**：瞳孔朝指针方向滑（上限 = 球宽 5%，再按角色收敛——蓝球眼白小、增益最小，瞳珠永远滑不出眼白），目光是「滑」过去的不是「跳」过去的；指针静止久了还会随机扫视、缓缓回中；身体还会朝视线方向微微侧 1° 左右——像被自己的目光牵着；
- **戳一下**：挤压回弹带「果冻余振」（衰减尾摆，各级面积分≈1、体积守恒），冒台词 + 从头顶飘出两三颗糖果心；
- **连戳（双击）**：原地转一个圈，转完晕一小会儿（×_× 眼）；
- **按住不动**：是摸摸——果冻鼓起、眯眼笑、腮红浮现；
- **打盹时戳它**：惊醒——弹起来抖一抖，睡意全无；
- **拖着走**：顺着惯性歪，像被吊在指尖，整只轻微「捏起」；松手还有一记落地小弹跳；
- **闲得久了**：自己哼支小曲，♪ 音符飘出来（36–60 秒随机冷却）；
- **每次登场**：随机挑一个入场动画——弹现 / 空降（影子先落地等你）/ 旋转 / 蹦入；
- **点右键**（或键盘 `Shift+F10`）：小菜单——角色 / 关注范围 / 大小 / 让它躲一会儿；
- **它感知环境**：窗口被拖大拖小会踉跄一下找平衡，睡醒先伸个懒腰，有人滚聊天记录时目光会跟着内容走一点——住在窗口里，不是贴在窗口上；
- **动画强度三档**：全量 / 轻柔 / 关——轻柔档保留全部反应但收敛幅度，关档只留表情切换（系统级「减弱动态效果」始终优先）。

### 边框就是会话状态

彩虹环实时反映会话：agent 运行中加速（4 s → 1.2 s/圈）；工具审批或向用户提问待处理时转琥珀色慢脉冲；发送失败或 agent 出错转红色快脉冲；一轮完成播放一周期的庆祝闪光。不用盯屏幕，余光就知道它干活到哪一步。

### 七种配色，还能跟着主题走

经典彩虹 / 极光 / 日落 / 蜜桃 / 海洋 / 赛博霓虹之外，还有**跟随主题**——经 `color-mix` 从宿主品牌色派生，深浅主题切换即时跟随，永不出戏。

## 🎭 五个角色

| 角色 | 眼 | 嘴 | 待机动作 | 气质 |
| --- | --- | --- | --- | --- |
| **红红** | 圆白眼 + 绿瞳 | 实心左尖三角 + 横杠 | 短促点头 | 傲娇、冷面 |
| **黄黄** | 白眼球 + 红半圆盖（半垂眼） | 白色笑口 + 嘴角黑豆 | 慢悠悠钟摆 | 慵懒、装酷 |
| **粉粉** | 大竖椭圆白眼 + 蓝瞳（对眼） | 波浪笔画 | 弹跳（squash & stretch） | 憨、呆萌 |
| **蓝蓝** | 黄框眼镜（随体型缩放）+ 黑瞳 | 粗 V 形 | 匀速呼吸 | 理性、认真 |
| **绿绿** | 斗在一起的小白眼 + 橙瞳（探出眼白） | 左低右高折线 | 不耐烦轻颤 | 暴躁、别扭 |

六种状态（待机 / 干活 / 等你 / 庆祝 / 出错 / 打盹）在五个角色上各有专属演绎：黄球干活时红盖压得更低、等你时瞳珠从盖下探出；蓝球打盹时镜框保持原形、镜片里是闭眼线；眨眼也不压镜框。切换走 `scale` / `translate` 渐变过渡——表情是「变」过去的，不是瞬切。

## 🌈 功能

- **彩虹跑马灯边框**：输入框卡片四周流动彩带，由旋转图层驱动——渐变只画一次再交给合成器转，**每帧重绘次数实测 360 → 0**。
- **桌面宠物「小虹」**：落在 `shell.overlay` 浮动层，可拖拽、位置持久化；纯 CSS 几何临摹的吧唧球简笔风，**无任何外部素材**，没有第三方形象的授权问题。
- **五个可选角色**（右键菜单或设置面板切换）：球色是身份、表情随状态变化，五套基准脸 + 25 组专属关键帧（待机/干活/庆祝/出错/打盹 × 五角色），动作语言互不相同。
- **互动细节**：戳一下果冻余振回弹、头顶飘糖果心（2-3 颗、连戳自动节流）、拖拽惯性摆动、瞳孔随指针滑动 + 随机扫视 + 视线倾斜。
- **权威回合边界**：宿主半经 Typert 贡献一条只读事件流（`remote.rainbowPet/watch`），浏览器半逐帧用同一份 Zod schema 校验后再采信；断号即重连，绝不拿半截状态糊弄用户。
- **宿主样式加固**：桌宠的圆形（球体/眼睛/瞳珠/命中区/光晕）全部 `longhand + !important` 钉死——宿主的全局 `button span` 规则改不动它；镜框线宽用容器查询单位随体型缩放，旧引擎自动回退固定线宽。
- **设置面板**（`Settings` → `Rainbow border`）：启用/禁用、流速、环宽、配色、位置、反向流动、呼吸亮度；**桌面宠物**分组：启用、角色（五选一）、关注范围、动画强度（全量/轻柔/关）、大小（0.6–1.6×）。全部偏好持久化在 `localStorage`，即时生效。

  ![设置面板：七种配色、流速、环宽与位置](assets/02-settings-rainbow.png)

- **在真实宿主条件下的样子**（模拟宿主全局规则渲染——见 [`preview/pet-client-sim.html`](preview/pet-client-sim.html)）：

  ![小虹：宿主条件模拟——气泡台词与指针跟随](assets/08-pet-live.png)

- **七种配色**：经典彩虹、极光、日落、蜜桃、海洋、赛博霓虹，以及**跟随主题**（`color-mix` 派生自宿主品牌令牌）。

  | 赛博霓虹 | 极光 | 日落 |
  | --- | --- | --- |
  | ![赛博霓虹](assets/03-cyberpunk-dark.png) | ![极光](assets/04-aurora-dark.png) | ![日落](assets/05-sunset-dark.png) |

- **跟随主题**（浅色模式）：边框取自宿主品牌色，主题切换即时跟随。

  ![跟随主题](assets/06-theme-follow-light.png)

- **会话状态感知**：agent 运行中环加速；审批/ask-user 待处理琥珀色慢脉冲；出错红色快脉冲；一轮完成播放庆祝闪光。优先级：错误 > 提醒 > 运行。
- **聚焦增亮**：输入框聚焦时环增亮增饱和，失焦缓退。
- **无障碍**：遵循 `prefers-reduced-motion`（动画禁用、保留静态环与表情）；设置控件带本地化标签与 aria 属性。
- **中英双语**：文案经宿主 locale 注册表下发，跟随宿主语言设置。

## 📦 安装

从 dsh CLI 安装：

```sh
dsh plugin add @kenz1117/dsh-ui-rainbowspeak
```

或手动加入 profile 的 `package.json`：

```json
{
  "dependencies": {
    "@kenz1117/dsh-ui-rainbowspeak": "*"
  }
}
```

本地开发可将依赖指向一个 checkout：

```json
{
  "dependencies": {
    "@kenz1117/dsh-ui-rainbowspeak": "link:/absolute/path/to/dsh-ui-rainbowspeak"
  }
}
```

然后在 profile 目录执行 `pnpm install` 并重启宿主。使用 `link:` 形式时，插件仓库里跑一次 `pnpm bundle`，宿主下次重启即取到改动——无需重装。

## ⚙️ 工作原理

- 插件在 apply 时挂载单张 `<style data-plugin>` 样式表，dispose 时移除（effect 生命周期）。
- 输入框卡片的 `::before` 绘制 `conic-gradient`，`mask` 合成只留边缘环带；色彩层是一张正方形锥形渐变绕中心自转 360°——不需要 `@property` 注册插值角度。
- 用户偏好与会话状态投影到 `<html>` 的 `data-rainbow-*` 属性与内联 CSS 变量，每个开关即时生效、无需重建样式表。
- 桌宠**宿主半**提供只读服务 `rainbowPet`：监听 `turn/start` / `turn/end`，只投影边界元数据；**浏览器半**经 `ctx.remote.$mount()` 消费，逐帧 Zod 校验、帧号连续性检查、断号退避重连。
- 桌宠形象全部是纯 CSS 几何（无图片/无 canvas）：嘴形是参考图扫描线生成的 `clip-path` 多边形，动画只走 `scale` / `translate` / `rotate` 合成属性，**每帧重绘为 0**；换状态不触发重排。
- 形象对宿主样式与尺寸变化做了完整加固：圆形用 longhand + `!important` 钉死、镜框线宽用 `cqw` 随体型缩放（旧引擎回退 px）、视线跟随按球宽比例并按角色收敛。

## 🛠 开发

```sh
pnpm install        # 依赖（peer 经 scripts/link-peers.mjs 链入 monorepo checkout）
pnpm test           # vitest 套件（node 半边、偏好钳制、状态投影、桌宠状态机与互动数学、bundle 冒烟）
pnpm typecheck      # tsc --noEmit
pnpm bundle         # tsdown: lib/index.js + lib/remote.js + lib/typert.host.js（node 半边）+ lib/client.js（浏览器 IIFE）
pnpm preview        # 生成两页预览：pet-states.html（5 角色 × 6 状态矩阵）
                    #            pet-client-sim.html（客户端条件模拟：宿主规则 + 指针跟随 + 三档尺寸）
pnpm bench:anim     # 动画性能实测台：Paint / 样式重算 / 布局指标
pnpm bench:pet-visual      # 六状态视觉回归（逐像素）
```

形象复刻工具链（`tools/anim-bench/`）：`scan-faces-precise.mjs` 参考图逐像素精测（连通域 + 扫描线）、`scan-runs.mjs` 定向切面全段色段、`mouth-poly.mjs` 扫描线 → `clip-path` 多边形、`compare-faces.mjs`「参考 | 实现 | 差分」三联图、`measure-grid.mjs` 大刻度读数图、`measure-implementation.mjs` 双口径 DOM 复测。形象规格与实测结论见 [`docs/character-design.md`](docs/character-design.md)。

## 🤝 兼容性

- **宿主**：dsh 桌面/网页宿主，实测基准 **0.2.x**（`engines.dsh >= 0.1.2-alpha.1` 为下限）。Peer：`@deepseek-ai/cordis`（宿主运行时提供）。
- **引擎**：Chromium/Chrome **≥ 105** 体验完整（容器查询单位 `cqw`、`@property` 变量眨眼）。旧引擎自动降级：镜框退回固定 2.1px 线宽、眨眼退回整体压合——表情与配色不受影响。
- **桌宠远端**：需要宿主支持 Typert 与客户端 Remote 运行时；缺失时插件照常加载，桌宠降级为「只看客户端会话状态」。
- **无障碍**：`prefers-reduced-motion` 全档尊重。

## 📄 许可证

[MIT](https://github.com/kenz1117/dsh-ui-rainbowspeak) © 2026 KenZ (kenz1117)
