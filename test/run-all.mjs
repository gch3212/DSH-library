/**
 * 跑全部自检。
 *
 *   node test/run-all.mjs
 *
 * 两种模式：
 *   - 子进程模式（默认）：每套测试一个独立进程，互不干扰，CI 和普通机器走这条。
 *   - 进程内模式：某些沙箱（比如 DSH Desktop 自己的 bash 沙箱）禁止 node 再开子进程，
 *     spawn 会报 EPERM。这时退化成按顺序 import 每套测试，并把它们的 process.exit 接住，
 *     结果汇总方式不变。
 *
 * 依赖 DSH profile 的几套（navicon / client.smoke / cordis.integration）找不到 profile 时自己 SKIP，不算失败。
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const suites = [
  { label: 'splice --check', file: join(root, 'scripts', 'splice-panel.mjs'), args: ['--check'] },
  { label: 'api.e2e', file: join(here, 'api.e2e.mjs'), args: [] },
  { label: 'tools.e2e', file: join(here, 'tools.e2e.mjs'), args: [] },
  { label: 'panel.smoke', file: join(here, 'panel.smoke.mjs'), args: [] },
  { label: 'plugin.smoke', file: join(here, 'plugin.smoke.mjs'), args: [] },
  { label: 'bugfix.test', file: join(here, 'bugfix.test.mjs'), args: [] },
  { label: 'extract.test', file: join(here, 'extract.test.mjs'), args: [] },
  { label: 'navicon.test', file: join(here, 'navicon.test.mjs'), args: [] },
  { label: 'client.smoke', file: join(here, 'client.smoke.mjs'), args: [] },
  { label: 'cordis.integration', file: join(here, 'cordis.integration.mjs'), args: [] }
]

const failures = []

function summarize(label, status, output, elapsed) {
  const skipped = /\bSKIP\b/.test(output)
  const lines = output.split('\n').filter((line) => line.trim() !== '')
  const lastLine = (skipped && lines.find((line) => line.startsWith('SKIP'))) || lines.slice(-1)[0] || ''
  console.log(`${status === 0 ? (skipped ? 'SKIP' : 'PASS') : 'FAIL'}  ${label.padEnd(20)} ${elapsed}s  ${lastLine}`)
  if (status !== 0) {
    failures.push(label)
    console.log(
      output
        .split('\n')
        .slice(-25)
        .map((line) => `      ${line}`)
        .join('\n')
    )
  }
}

/** 能不能开子进程？沙箱里会 EPERM。 */
function canSpawn() {
  const probe = spawnSync(process.execPath, ['-e', '0'], { encoding: 'utf8' })
  return probe.status === 0
}

if (canSpawn()) {
  for (const suite of suites) {
    const started = Date.now()
    const result = spawnSync(process.execPath, [suite.file, ...suite.args], { cwd: root, encoding: 'utf8' })
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    summarize(suite.label, result.status, output, ((Date.now() - started) / 1000).toFixed(1))
  }
} else {
  console.log('（本环境禁止 node 开子进程，改用进程内顺序执行）')
  const originalExit = process.exit.bind(process)
  const originalArgv = process.argv
  const originalLog = console.log.bind(console)
  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)

  for (const suite of suites) {
    const started = Date.now()
    const sentinel = Symbol('suite-exit')
    const lines = []
    let code = 0

    // 收集这一套的输出，别和汇总表混在一起；失败时一并打印。
    console.log = (...args) => lines.push(args.join(' '))
    console.error = console.log
    console.warn = console.log
    // 有些脚本看 process.argv 决定行为（scripts/splice-panel.mjs --check），进程内跑时要伪装一下。
    process.argv = [process.execPath, suite.file, ...suite.args]
    process.exit = (value) => {
      throw { [sentinel]: typeof value === 'number' ? value : 0 }
    }

    try {
      await import(pathToFileURL(suite.file).href)
    } catch (error) {
      if (error !== null && typeof error === 'object' && sentinel in error) code = error[sentinel]
      else {
        code = 1
        lines.push(error?.stack || String(error))
      }
    } finally {
      process.exit = originalExit
      process.argv = originalArgv
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }

    summarize(suite.label, code, lines.join('\n'), ((Date.now() - started) / 1000).toFixed(1))
  }
}

console.log('')
if (failures.length === 0) {
  console.log('全部通过')
  process.exit(0)
}
console.log(`失败 ${failures.length} 套：${failures.join(', ')}`)
process.exit(1)
