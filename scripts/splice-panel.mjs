/**
 * 生成 lib/client.js。
 *
 * 客户端半侧是手写的 IIFE（没有打包步骤，DSH 直接按 `dsh.client` 加载这一份），
 * 2500 多行里有 1400 行是侧边栏面板。为了能改得动，源码拆成两份：
 *
 *   src/base-client.js   设置页那一半（原作者的 0.4.x 结构）
 *   src/panel.part.js    侧边栏面板那一半（文件树 / 拖拽 / 备注 / 最近访问 / 工作文件）
 *
 * 这个脚本把它们拼成 lib/client.js，并顺手接好三处胶水：
 *   1. 面板代码插在 `function makeFactory()` 之前（同一个 IIFE 作用域）；
 *   2. apply() 里解析 uiWorkspace 服务（「定位到聊天」用），拿不到就退化；
 *   3. 注册 `main` 与 `sidebar.panellist` 两个槽位——两边的 id 必须是同一个字符串。
 *
 * 用法：
 *   node scripts/splice-panel.mjs          # 重新生成 lib/client.js
 *   node scripts/splice-panel.mjs --check  # 只检查 lib/client.js 是否与 src 同步（CI 用，不同步退出码 1）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const basePath = join(root, 'src', 'base-client.js')
const partPath = join(root, 'src', 'panel.part.js')
const outPath = join(root, 'lib', 'client.js')

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`拼接锚点没找到：${label}`)
  return text.split(from).join(to)
}

export function build() {
  const base = readFileSync(basePath, 'utf8')
  const panel = readFileSync(partPath, 'utf8')

  // 1) 面板代码插在 makeFactory 之前
  const anchor = '  function makeFactory() {'
  let client = replaceOnce(base, anchor, `${panel.replace(/\s+$/, '')}\n\n${anchor}`, 'makeFactory')

  // 2) apply() 里解析 uiWorkspace + 定义 jumpToSession
  client = replaceOnce(
    client,
    `        const Section = makeSettings({ useState, useEffect, useCallback, useRef, t })
`,
    `        // 会话跳转：uiWorkspace 是客户端服务。用 ctx.inject 拿，拿不到也不影响面板其余部分，
        // 只是「定位到聊天」会退化成一条提示。不写进 inject 数组，是为了不因为服务改名就让整个插件挂掉。
        let uiWorkspace
        try {
          if (typeof ctx.inject === 'function') {
            ctx.inject(['uiWorkspace'], (services) => {
              uiWorkspace = services.uiWorkspace
            })
          }
        } catch (error) {
          console.warn('[dsh-local-library] uiWorkspace injection skipped:', error)
        }
        const jumpToSession = (sessionId) => {
          let service = uiWorkspace
          if (!service && typeof ctx.get === 'function') {
            try {
              service = ctx.get('uiWorkspace')
            } catch {
              service = undefined
            }
          }
          if (!service || typeof service.openSession !== 'function') return false
          try {
            service.openSession(String(sessionId))
            return true
          } catch (error) {
            console.warn('[dsh-local-library] openSession failed:', error)
            return false
          }
        }

        const Section = makeSettings({ useState, useEffect, useCallback, useRef, t })
`,
    'apply: uiWorkspace'
  )

  // 3) settings.section 之后追加 main + sidebar.panellist
  const iconEffect = `        ctx.effect(() => {
          try {
            return installNavIcon(() => t('nav'))
          } catch (error) {
            // 图标只是锦上添花，DOM 结构和 DSH 版本相关，失败就沿用默认齿轮。
            console.warn('[dsh-local-library] nav icon skipped:', error)
            return () => {}
          }
        }, 'dsh-local-library: settings nav icon')
`
  client = replaceOnce(
    client,
    iconEffect,
    `${iconEffect}
        // ── 侧栏入口 + 主面板 ────────────────────────────────────────────
        // 侧栏那个图标的 id 就是 main 槽里选中哪个面板的 key，两者必须用同一个字符串，
        // DSH 靠它把「点图标」和「渲染哪块面板」对上。
        injectPanelCss(typeof document === 'undefined' ? undefined : document)
        const Panel = makePanel({ useState, useEffect, useCallback, useRef, language, jumpToSession })
        const SidebarIcon = makeSidebarIcon()

        ctx.slots.inject('main', function* () {
          yield ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ t })
            },
            Panel
          )
        })

        ctx.slots.inject('sidebar.panellist', function* () {
          yield ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              // 排在「对话」与其它面板之间偏前的位置：资料库是常驻入口，不该沉到底下。
              order: 18,
              label: () => t('nav'),
              locale: NS
            },
            SidebarIcon
          )
        })
`,
    'apply: slots'
  )

  return client
}

const generated = build()

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(outPath, 'utf8')
  } catch {
    current = ''
  }
  if (current === generated) {
    console.log(`OK lib/client.js 与 src 同步（${generated.length} 字节）`)
    process.exit(0)
  }
  console.error('lib/client.js 与 src/base-client.js + src/panel.part.js 不同步，先跑 node scripts/splice-panel.mjs')
  process.exit(1)
}

writeFileSync(outPath, generated, 'utf8')
console.log(`生成 lib/client.js：${generated.length} 字节`)
