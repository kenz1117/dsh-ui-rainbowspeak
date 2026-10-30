#!/usr/bin/env node
/**
 * 桌宠视觉回归比对：把当前六种状态的截图与参考图逐像素对比。
 *
 * 用法：
 *   node tools/anim-bench/verify-pet-visual.mjs --update-ref <dir>   # 先建参考图
 *   node tools/anim-bench/verify-pet-visual.mjs --ref <dir>          # 再比对
 *
 * 判定阈值：平均通道差 ≤ 2.0（--tolerance 可调）且差异像素占比 ≤ 2%（--diff-ratio 可调）。
 * 退出码：全部一致 0；有差异 1；用法/环境错误 2（便于 CI 区分「样式变了」和「台子没跑起来」）。
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  OUT_DIR, PET_STATES, DIFF_CHANNEL_THRESHOLD,
  buildBenchPage, startStaticServer, launchChrome, connectPage, capturePetStates,
  compareShots, renderDiffPng, writeSnapshot,
} from './lib/pet-shots.mjs'

const DEFAULT_TOLERANCE = 2.0
const DEFAULT_DIFF_RATIO = 2.0

/**
 * 解析命令行参数。
 * @param {string[]} argv 形参。
 * @returns {object} 解析结果。
 */
function parseArgs(argv) {
  let ref = null
  let updateRef = null
  let out = join(OUT_DIR, 'pet-diff')
  let tolerance = DEFAULT_TOLERANCE
  let diffRatio = DEFAULT_DIFF_RATIO
  let skipBuild = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (!value) throw new Error(`${arg} 需要一个参数`)
      return value
    }
    if (arg === '--ref') ref = resolve(process.cwd(), next())
    else if (arg === '--update-ref') updateRef = resolve(process.cwd(), next())
    else if (arg === '--out') out = resolve(process.cwd(), next())
    else if (arg === '--tolerance') tolerance = Number(next())
    else if (arg === '--diff-ratio') diffRatio = Number(next())
    else if (arg === '--skip-build') skipBuild = true
    else if (arg === '--help' || arg === '-h') {
      console.log('用法：node tools/anim-bench/verify-pet-visual.mjs --ref <dir> [--tolerance 2.0] [--diff-ratio 2] [--out <dir>]')
      console.log('      node tools/anim-bench/verify-pet-visual.mjs --update-ref <dir>')
      process.exit(0)
    } else throw new Error(`未知参数：${arg}`)
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('--tolerance 需要一个非负数')
  if (!Number.isFinite(diffRatio) || diffRatio < 0) throw new Error('--diff-ratio 需要一个非负数')
  return { ref, updateRef, out, tolerance, diffRatio, skipBuild }
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (err) {
  console.error(`参数错误：${err.message}`)
  process.exit(2)
}

if (!args.ref && !args.updateRef) {
  console.error('用法错误：需要 --ref <参考图目录> 或 --update-ref <参考图目录>')
  process.exit(2)
}

if (!args.skipBuild) await buildBenchPage()

const server = await startStaticServer()
const chrome = await launchChrome()
const page = await connectPage(chrome.port)

try {
  const shots = await capturePetStates({ send: page.send, evaluate: page.evaluate, url: server.url, states: PET_STATES })

  /* —— 建参考图：把当前快照原样写进参考目录 —— */
  if (args.updateRef) {
    const manifest = await writeSnapshot(args.updateRef, shots, PET_STATES)
    console.log(`参考图已写入 → ${args.updateRef}`)
    for (const state of manifest.states) console.log(`  ${state}`)
    process.exitCode = 0
  } else {
    /* —— 比对：参考目录必须先存在，否则这里就该炸，而不是拿空图糊弄过去 —— */
    if (!existsSync(args.ref)) {
      console.error(`参考图目录不存在：${args.ref}`)
      console.error('先建立参考图：node tools/anim-bench/snapshot-pet.mjs --ref <dir>')
      console.error('或直接：node tools/anim-bench/verify-pet-visual.mjs --update-ref <dir>')
      process.exitCode = 2
    } else {
      const manifestPath = join(args.ref, 'manifest.json')
      const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null
      const states = manifest?.states?.length ? manifest.states : PET_STATES

      const refs = {}
      const missing = []
      for (const state of states) {
        const path = join(args.ref, `${state}.png`)
        if (!existsSync(path)) { missing.push(state); continue }
        refs[state] = (await readFile(path)).toString('base64')
      }
      if (missing.length) {
        console.error(`参考图缺少这些状态：${missing.join('、')}`)
        console.error(`参考图目录：${args.ref}`)
        process.exitCode = 2
      } else {
        const rows = []
        let failed = 0
        for (const state of states) {
          const result = await compareShots(page.evaluate, shots[state].data, refs[state], DIFF_CHANNEL_THRESHOLD)
          let ok
          let note = ''
          if (result.sizeMismatch) {
            ok = false
            note = `尺寸不一致 当前 ${result.curSize.join('×')} / 参考 ${result.refSize.join('×')}`
          } else {
            ok = result.mean <= args.tolerance && result.diffRatio <= args.diffRatio
          }
          if (!ok) failed++
          rows.push({ state, ok, note, result })

          // 差异图给人看：差异像素标红，一致的压成淡灰。
          const dataUrl = await renderDiffPng(page.evaluate, shots[state].data, refs[state], DIFF_CHANNEL_THRESHOLD)
          await mkdir(args.out, { recursive: true })
          await writeFile(join(args.out, `${state}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'))
        }

        for (const row of rows) {
          const mean = row.result.mean ?? 0
          const ratio = row.result.diffRatio ?? 0
          console.log(
            `  ${row.state.padEnd(11)} 平均差 ${mean.toFixed(4).padStart(8)}  差异占比 ${ratio.toFixed(4).padStart(8)}%  ${row.ok ? '一致' : '有差异'}${row.note ? `  ${row.note}` : ''}`,
          )
        }
        console.log(`差异图 → ${args.out}`)
        if (failed === 0) {
          console.log(`全部一致（${rows.length} 个状态）`)
          process.exitCode = 0
        } else {
          console.log(`${failed} 个状态有差异：${rows.filter((r) => !r.ok).map((r) => r.state).join('、')}`)
          process.exitCode = 1
        }
      }
    }
  }
} finally {
  page.close()
  await chrome.close()
  await server.close()
}
