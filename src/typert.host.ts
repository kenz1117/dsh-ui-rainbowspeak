/**
 * 宿主面 Typert 清单：本插件通过 `./typert` 子路径向宿主贡献的只读边界流。
 *
 * 宿主加载器（`@deepseek-ai/dsh-typert-loader`）在插件挂载时读取本包的
 * `package.json`，发现 `./typert` 导出便导入本模块，校验 `TYPERT` 清单后
 * 注册进 `ctx.typert`。清单里声明的东西必须是事实：
 * - `package` 必须与包名一致（贡献归属由包名决定）；
 * - `face` 必须是 `'host'`（本文件只贡献宿主面）；
 * - `schemas` 每项带 `create()` 工厂，返回的必须是 Zod v4 schema 实例；
 * - `model.services` 是这份服务对宿主可见的反射信息（供模型与检查工具读取）。
 *
 * 清单声明的 `watch` 方法是**只读**的：它只投影回合边界元数据，
 * 不返回聊天内容、不处理审批、不调用模型。
 *
 * @module @kenz1117/dsh-ui-rainbowspeak/typert.host
 */

import { BOUNDARY_FRAME_SCHEMA, FRAME_TYPE_SYMBOL, NAMESPACE, PACKAGE_NAME, WATCH_DESCRIPTOR } from './remote.ts'

/**
 * 宿主面贡献清单。
 *
 * 由 `dsh-typert-loader` 校验：包名归属、face、schema 工厂、模型反射与
 * 调用描述符缺一不可。
 */
export const TYPERT = {
  package: PACKAGE_NAME,
  face: 'host',
  schemas: [
    {
      name: 'RainbowBoundaryFrame',
      create: () => BOUNDARY_FRAME_SCHEMA,
    },
  ],
  invocations: [WATCH_DESCRIPTOR],
  model: {
    services: [
      {
        key: NAMESPACE,
        exportName: 'RainbowBoundaryService',
        description: 'Read-only live turn boundaries; no content, history, approval handling or model calls.',
        summary: 'Rainbow companion live boundaries',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'watch',
            signature: `watch(signal: AbortSignal): AsyncIterable<${FRAME_TYPE_SYMBOL}>`,
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
