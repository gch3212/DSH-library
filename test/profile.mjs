/**
 * 从 DSH profile 的 node_modules 里取一份「浏览器里正在用的」依赖（react、cordis 等）。
 *
 * 有些测试要真依赖（react-dom/server 渲染、@deepseek-ai/cordis 起 Context），
 * 但插件本身零依赖——所以这些测试在没有 profile 的机器（CI、别人的电脑）上要 SKIP，
 * 不能把作者本机的绝对路径写死在测试里。
 *
 * 查找顺序：
 *   1. $DSH_PROFILE_DIR（显式指定，优先级最高）
 *   2. $DSH_HOME/profiles/desktop、$DSH_HOME/profiles/web、$DSH_HOME 本身
 *   3. %APPDATA%/dsh-desktop/harness 下的同样几种
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

function candidates() {
  const list = []
  if (process.env.DSH_PROFILE_DIR) list.push(process.env.DSH_PROFILE_DIR)
  const homes = [process.env.DSH_HOME, join(process.env.APPDATA || '', 'dsh-desktop', 'harness')].filter(Boolean)
  for (const home of homes) {
    list.push(join(home, 'profiles', 'desktop'), join(home, 'profiles', 'web'), home)
  }
  return list.filter(Boolean)
}

/** 找到第一个长得像 profile 的目录（有 package.json 和 node_modules）；找不到返回 ''。 */
export function resolveProfileDir() {
  for (const dir of candidates()) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'node_modules'))) return dir
  }
  return ''
}

/**
 * 解析一组模块，返回 { dir, error, modules }。
 * error 非空时调用方应该 SKIP（而不是 FAIL）。
 */
export function tryProfileRequire(names) {
  const dir = resolveProfileDir()
  if (!dir) {
    return { dir: '', error: '找不到 DSH profile（可用 DSH_PROFILE_DIR 指定）', modules: {} }
  }
  const require = createRequire(join(dir, 'package.json'))
  const modules = {}
  try {
    for (const name of names) modules[name] = require(name)
  } catch (error) {
    return { dir, error: error.message, modules }
  }
  return { dir, error: '', modules }
}
