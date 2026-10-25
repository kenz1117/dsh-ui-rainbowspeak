<div align="center">

# dsh-ui-rainbowspeak

<p align="center"><b>虹语</b> RainbowSpeak — 一圈会流动的彩虹边框，外加一只住在窗口里的彩虹水滴桌宠「小虹」：会看你的指针、等你点确认、只在该庆祝时庆祝。</p>

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

<div align="center">
  <img src="assets/01-rainbowspeak-default.png" alt="dsh-ui-rainbowspeak — 输入框经典彩虹边框" width="80%">
</div>

<div align="center">
  <img src="assets/07-pet-states.png" alt="小虹 — 六种表情：待机 / 干活 / 等你 / 庆祝 / 出错 / 打盹" width="80%">
</div>

## ✨ 为什么选它

### 纯装饰，零侵入

不接管任何插槽、不打宿主补丁、不注册工具、不注入系统提示。彩虹环是纯浏览器端装饰：一条 `conic-gradient` 圆环经蒙版只留卡片边缘，靠注册的自定义属性旋转流动。引擎不支持 `@property` 时自动降级为静态渐变环。

桌宠也遵守同一条边界：宿主侧只多了一条**只读**的回合边界流（会话身份 + 回合序号 + 结束原因），**不携带任何聊天内容、历史或审批细节**；浏览器侧只往 `shell.overlay` 挂一个浮动条目，不改宿主的任何既有界面。

### 边框 + 一只住在窗口里的小虹

除了边框，插件还带来**「小虹」**——一只住在 DSH 窗口里的彩虹水滴桌宠。可拖拽、记住位置，挂在 `shell.overlay` 浮动层上，六种状态随手切换：待机 / 干活 / 等你点一下 / 庆祝 / 出错 / 打盹。

小虹的**成功与失败以宿主的回合边界为准**（经 Typert 远端读 `session/event` 的 `turn/end`）：被取消的一轮不会报喜，报喜是撒谎。远端不可用时它只依据客户端会话状态做「在跑 / 在等你」的表情，安静降级，不编造结论。

### 会看你的小虹

- **眼睛跟着指针走**：瞳孔朝指针方向偏一点（上限 4.5px，不会挪出眼眶）；指针静止久了，瞳孔还会自己随机扫视——像有自己的主意；
- **戳一下**：挤压回弹 + 冒出台词（五句轮换）+ 炸开几颗小心心；
- **连戳（双击）**：原地转一个圈，转完晕一小会儿（×_× 眼）；
- **按住不动**：是摸摸——果冻鼓起、眯眼笑、腮红拉满；
- **拖着走**：顺着惯性歪，像被吊在指尖；
- **点右键**（或键盘 `Shift+F10`）：小菜单——关注范围 / 大小 / 让它躲一会儿；
- **台词会换**：每个状态两句轮换，不复读机；
- **它感知环境**：窗口被拖大拖小会踉跄一下找平衡，睡醒先伸个懒腰，有人滚聊天记录时目光会跟着内容走一点——住在窗口里，不是贴在窗口上；
- **动画强度三档**：全量 / 轻柔 / 关——轻柔档保留全部反应但收敛幅度，关档只留表情切换（系统级「减弱动态效果」始终优先）。

### 边框就是会话状态

彩虹环实时反映会话：agent 运行中加速（4 s → 1.2 s/圈）；工具审批或向用户提问待处理时转琥珀色慢脉冲；发送失败或 agent 出错转红色快脉冲；一轮完成播放一周期的庆祝闪光。不用盯屏幕，余光就知道它干活到哪一步。

### 七种配色，还能跟着主题走

经典彩虹 / 极光 / 日落 / 蜜桃 / 海洋 / 赛博霓虹之外，还有**跟随主题**——经 `color-mix` 从宿主品牌色派生，深浅主题切换即时跟随，永不出戏。

## 🌈 功能

- **彩虹跑马灯边框**：输入框卡片（`[data-composer-card]` 宿主锚点）四周流动彩带，经注册的 `@property` 角度驱动渐变真实动起来；不支持 `@property` 的引擎降级为静态渐变环。
- **桌面宠物「小虹」**：落在 `shell.overlay`（帧级浮动层，宿主推荐给「可拖拽置顶小挂件」的席位），可拖拽、位置持久化、点一下冒泡打招呼；形象是纯 CSS 几何，**无任何外部素材**，因此没有第三方形象的授权问题。
- **会互动**：瞳孔跟随指针、戳一下挤压回弹并冒心心、拖拽时顺惯性摆动、右键（或 `Shift+F10`）打开小菜单（关注范围 / 大小 / 隐藏）。
- **六种表情**：待机（呼吸 + 摇摆）、干活（眯眼专注 + 点头）、等你（琥珀 + 竖瞳 + 挑眉）、庆祝（弹跳 + 星火 + 大笑 + 舌头）、出错（红色 + 汗滴 + 苦笑）、打盹（闭眼 + Zzz，空闲 2 分钟自动进入）。表情细节（眼白/瞳孔/双层高光、眉毛、嘴型、腮红）逐状态不同。
- **真·水滴剪影**：身体经内联 SVG 路径 + `clip-path` 剪成尖端朝上的水滴，轮廓描边同为路径绘制——几何精确，不受宿主样式干扰；多层高光（主反射 + 小星点 + 顶部天光 + 底部暗部）营造玻璃质感；庆祝跳起时影子同步缩放、打盹呼吸时影子同步起伏（动画的次要动作原则）。
- **闲逛的目光**：指针静止 3 秒后，瞳孔每隔 2.4–5.6 秒随机扫视一次再回中——「活着感」来自看似自主的小动作，间隔刻意不规律。
- **权威回合边界**：宿主半经 Typert 贡献一条只读事件流（`remote.rainbowPet/watch`），浏览器半逐帧用同一份 Zod schema 校验后再采信；断号即重连，绝不拿半截状态糊弄用户。
- **设置面板**（`Settings` → `Rainbow border`）：启用/禁用、流速（1–10 秒/圈）、环宽（1–6 px）、配色、位置（四边/顶部/底部）、反向流动、呼吸亮度叠加；以及**桌面宠物**分组：启用桌宠、关注范围（全部会话 / 当前会话）、动画强度（全量 / 轻柔 / 关）、桌宠大小（0.6–1.6×）。全部偏好持久化在 `localStorage`，即时生效。

  ![设置面板：七种配色、流速、环宽与位置](assets/02-settings-rainbow.png)
- **桌宠在真实宿主里的样子**：

  ![小虹挂在 DSH 窗口的浮动层上](assets/08-pet-live.png)
- **七种配色**：经典彩虹、极光、日落、蜜桃、海洋、赛博霓虹（青/紫/品红，带白色灯闪段），以及**跟随主题**——经 `color-mix` 从宿主品牌令牌派生。
- **会话状态感知**：经宿主 dock 座位读取会话状态——agent 运行中环加速（4 s → 1.2 s/圈）；工具审批或 ask-user 待处理时琥珀色慢脉冲；发送失败或 agent 出错红色快脉冲；一轮完成时播放一周期的庆祝闪光。优先级：错误 > 提醒 > 运行。
- **聚焦增亮**：输入框聚焦时环增亮增饱和，失焦缓退。
- **无障碍**：遵循 `prefers-reduced-motion`（动画禁用、保留静态环）；设置控件带本地化标签与 aria 属性。
- **中英双语**：文案经宿主 locale 注册表下发，跟随宿主语言设置。

## 🎨 配色一览

| 赛博霓虹 | 极光 | 日落 |
| --- | --- | --- |
| ![赛博霓虹：深色主题下的青紫品红高冲击配色](assets/03-cyberpunk-dark.png) | ![极光：深色主题下的青绿配色](assets/04-aurora-dark.png) | ![日落：深色主题下的橙紫配色](assets/05-sunset-dark.png) |

**跟随主题**（浅色模式）：边框取自宿主品牌色，主题切换即时跟随。

![跟随主题：浅色模式下与宿主品牌色联动](assets/06-theme-follow-light.png)

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
- 输入框卡片的 `::before` 绘制覆盖整个色轮的 `conic-gradient`；`mask` 合成把内部裁掉，只留边缘环带，圆角对齐卡片半径。环宽与流速从 `--dsh-rainbow-*` 变量读取。
- `--dsh-rainbow-angle` 经 `@property` 注册为 `<angle>`，渐变起始角因此可插值；关键帧让它旋转 360°。
- 用户偏好与会话状态投影到 `<html>` 的 `data-rainbow-*` 属性与内联 CSS 变量，每个开关即时生效、无需重建样式表。
- 状态桥读取宿主会话座位与全局待交互座位（审批/ask-user）——只在插件层，不涉及 agent-loop。
- 桌宠的**宿主半**提供一条只读服务 `rainbowPet`：监听 `session/event` 的 `turn/start` / `turn/end`，只投影边界元数据（会话身份、回合序号、结束原因），不读历史、不留内容、不碰审批。经 `./typert` 子路径贡献给 Typert 网关。
- 桌宠的**浏览器半**经 `ctx.remote.$mount()` 挂载同一份契约，再注入 `remote.rainbowPet` 命名空间消费事件流；逐帧用与宿主同源的 Zod schema 校验，帧序号必须连续，断号即退避重连。
- 远端运行时（API Gateway）缺席时桌宠安静降级：只依据客户端会话状态做「在跑 / 在等你」的表情，不报喜也不报错——没有权威事件就不该编结论。

## 🛠 开发

```sh
pnpm install        # 依赖（peer 经 scripts/link-peers.mjs 链入 monorepo checkout）
pnpm test           # vitest 套件（node 半边、偏好钳制、状态投影、桌宠状态机与互动数学、bundle 冒烟）
pnpm typecheck      # tsc --noEmit
pnpm bundle         # tsdown: lib/index.js + lib/remote.js + lib/typert.host.js（node 半边）+ lib/client.js（浏览器 IIFE）
pnpm preview        # 生成 preview/pet-states.html：六种表情的离线对照页（改 CSS 后用它一眼看全）
```

`client` 半边是注入宿主 web 客户端的自包含 IIFE；`node` 半边提供彩虹状态桥与桌宠的只读边界服务，并导出 `./typert` 宿主面清单。

`preview/pet-states.html` 不依赖宿主：把 `src/client/pet.module.css` 原样内联，配六份静态标记。改完 CSS 跑一次 `pnpm preview`，浏览器打开即可对照六种状态——比每次都去宿主里点一遍快得多。

## 🤝 兼容性

- 客户端平台：`web`（desktop/web 宿主渲染）。流动动画需要 `@property` 支持（所有 Chromium/Electron 构建均可用）；其他引擎显示静态环。
- Peer：`@deepseek-ai/cordis`（由宿主在运行时提供）。
- 桌宠需要宿主支持 Typert（`@deepseek-ai/dsh-typert-loader`）与客户端 Remote 运行时；缺失时插件照常加载，桌宠降级为「只看客户端会话状态」。


## 📄 许可证

[MIT](https://github.com/kenz1117/dsh-ui-rainbowspeak) © 2026 KenZ (kenz1117)
