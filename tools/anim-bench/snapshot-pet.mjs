#!/usr/bin/env node
/**
 * 桌宠视觉回归基线：把六种状态各拍一张，存成参考图。
 *
 * 用法：
 *   node tools/anim-bench/snapshot-pet.mjs                     # 写到 .out/pet-snapshots
 *   node tools/anim-bench/snapshot-pet.mjs --out <dir>         # 指定输出目录
 *   node tools/anim-bench/snapshot-pet.mjs --ref <dir>         # 把当前快照写成参考图
 *
 * 拍之前会先跑一次 build.mjs：快照必须来自仓库里**当前**的真实样式，
 * 否则参考图会与源码脱节，后面所有的「一致」都是假的。
 */
import { resolve, join } from 'node:path'
import {
  BENCH_DIR, OUT_DIR, PET_STATES,
  buildBenchPage, startStaticServer, launchChrome, connectPage, capturePetStates, writeSnapshot,
} from './lib/pet-shots.mjs'

/**
 * 解析命令行参数。
 * @param {string[]} argv 形参。
 * @returns {{out: string, skipBuild: boolean}} 解析结果。
 */
function parseArgs(argv) {
  let out = join(OUT_DIR, 'pet-snapshots')
  let skipBuild = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' || arg === '--ref') {
      const value = argv[++i]
      if (!value) throw new Error(`${arg} 需要一个目录参数`)
      out = resolve(process.cwd(), value)
    } else if (arg === '--skip-build') {
      skipBuild = true
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法：node tools/anim-bench/snapshot-pet.mjs [--out <dir>] [--ref <dir>] [--skip-build]')
      process.exit(0)
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  return { out, skipBuild }
}

const { out, skipBuild } = parseArgs(process.argv.slice(2))

if (!skipBuild) await buildBenchPage()

const server = await startStaticServer()
const chrome = await launchChrome()
const page = await connectPage(chrome.port)

try {
  const shots = await capturePetStates({ send: page.send, evaluate: page.evaluate, url: server.url, states: PET_STATES })
  const manifest = await writeSnapshot(out, shots, PET_STATES)
  console.log(`桌宠快照 → ${out}`)
  for (const state of manifest.states) {
    const { clip } = shots[state]
    console.log(`  ${state.padEnd(11)} ${clip.width}×${clip.height}  ${manifest.images[state]}`)
  }
  console.log(`  manifest.json（${manifest.states.length} 个状态）`)
} finally {
  page.close()
  await chrome.close()
  await server.close()
}
