import { clientBundle } from './scripts/clientBundle.ts'

// 双 face 构建包工厂（billing/engram 的 vendored 副本，专为仓库外插件设计）：
// - node 半：src/index.ts 直打 lib/index.js（esm）
// - client 半：src/client/index.ts 打包 lib/client.js（cjs closure-factory，
//   minify，平台 8 项 external；本插件无 CSS Modules 文件，样式以字符串内联）
// face-undefined（不传 DSH_BUILD_FACE）一次产出两半。
export default clientBundle('@kenz1117/dsh-ui-rainbowspeak', ['src/index.ts', 'src/remote.ts', 'src/typert.host.ts'], {
  lib: { dts: false },
})
