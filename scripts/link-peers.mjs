#!/usr/bin/env node
/**
 * 把本插件的 @deepseek-ai/* peer 依赖从 deepseek-harness 工作区 symlink 进 node_modules。
 *
 * 为什么不用 file:/npm 安装：harness 内部包的 dependencies 使用 workspace:^ 协议，
 * 脱离其工作区无法经 pnpm 解析；npm 上的 @deepseek-ai 依赖链也不完整。
 * symlink 后，被链接包内部对其他 @deepseek-ai/* 的 import 会沿真实路径（harness 树内）
 * 向上解析到 harness 自己的 workspace node_modules，传递链自动闭合。
 *
 * 前置：deepseek-harness 已执行 pnpm install（vendor/cordis 源码在位）。
 * 幂等：已存在的链接跳过。发布形态下这些包是 peerDependencies，由 dsh profile 提供。
 */

import { existsSync, mkdirSync, symlinkSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(repoRoot, '..', 'deepseek-harness')

/** 直接 import 的包：cordis（类型与运行时）+ 宿主 client 平台包（类型，打包时经平台模块表外置）。 */
const LINKED_PACKAGES = [
  ['@deepseek-ai/cordis', 'vendor/cordis'],
  ['@deepseek-ai/dsh-client-locale', 'packages/client/locale'],
  ['@deepseek-ai/dsh-client-store', 'packages/client/store'],
  ['@deepseek-ai/dsh-client-ui-conversation', 'packages/client/ui-conversation'],
  ['@deepseek-ai/dsh-client-ui-layout', 'packages/client/ui-layout'],
  ['@deepseek-ai/dsh-client-ui-primitives', 'packages/client/ui-primitives'],
  ['@deepseek-ai/dsh-client-ui-renderer', 'packages/client/ui-renderer'],
  ['@deepseek-ai/dsh-client-ui-session', 'packages/client/ui-session'],
  ['@deepseek-ai/dsh-client-ui-settings', 'packages/client/ui-settings'],
  ['@deepseek-ai/dsh-client-ui-slots', 'packages/client/ui-slots'],
  ['@deepseek-ai/dsh-client-connection', 'packages/client/connection'],
  ['@deepseek-ai/dsh-api-gateway', 'packages/api/gateway'],
  ['@deepseek-ai/dsh-api-session-controller', 'packages/api/session-controller'],
  ['@deepseek-ai/dsh-typert-protocol', 'packages/typert/protocol'],
]

const scopeDir = join(repoRoot, 'node_modules', '@deepseek-ai')
mkdirSync(scopeDir, { recursive: true })

let created = 0
let skipped = 0
for (const [name, rel] of LINKED_PACKAGES) {
  const target = join(harnessRoot, rel)
  if (!existsSync(target)) {
    console.error(`[link-peers] 缺少链接源：${target}（请先在 deepseek-harness 执行 pnpm install）`)
    process.exit(1)
  }
  const link = join(scopeDir, name.replace('@deepseek-ai/', ''))
  if (existsSync(link)) {
    skipped += 1
    continue
  }
  symlinkSync(target, link, 'dir')
  created += 1
  console.log(`[link-peers] ${name} -> ${target}`)
}
console.log(`[link-peers] 完成：新建 ${created} 个，已存在 ${skipped} 个`)
