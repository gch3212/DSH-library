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

  // 2) apply() 里解析 uiWorkspace + jumpToSession，并定义 DSH 文档面板的 openDocument
  client = replaceOnce(
    client,
    "        const Section = makeSettings({ useState, useEffect, useCallback, useRef, t })",
    "        // 会话跳转：uiWorkspace 是客户端服务。用 ctx.inject 拿，拿不到也不影响面板其余部分，\n        // 只是「定位到聊天」会退化成一条提示。不写进 inject 数组，是为了不因为服务改名就让整个插件挂掉。\n        let uiWorkspace\n        try {\n          if (typeof ctx.inject === \"function\") {\n            ctx.inject([\"uiWorkspace\"], (services) => {\n              uiWorkspace = services.uiWorkspace\n            })\n          }\n        } catch (error) {\n          console.warn(\"[DSH-library] uiWorkspace injection skipped:\", error)\n        }\n        const clientService = (name, current) => {\n          if (current) return current\n          if (typeof ctx.get !== \"function\") return undefined\n          try {\n            return ctx.get(name)\n          } catch {\n            return undefined\n          }\n        }\n        const jumpToSession = (sessionId) => {\n          const service = clientService(\"uiWorkspace\", uiWorkspace)\n          if (!service || typeof service.openSession !== \"function\") return false\n          try {\n            service.openSession(String(sessionId))\n            return true\n          } catch (error) {\n            console.warn(\"[DSH-library] openSession failed:\", error)\n            return false\n          }\n        }\n\n        // ── DSH 自带的文档面板 ────────────────────────────────────────────\n        // sidebarRight 是客户端服务（右侧标签栏的路由与标签都归它管），layout 用来把主区域\n        // 从「本地资料库」切回对话：右侧标签栏只挂在对话上，主区域被全局面板占着时它没有会话。\n        let sidebarRight\n        let layoutService\n        try {\n          if (typeof ctx.inject === \"function\") {\n            ctx.inject([\"sidebarRight\"], (services) => {\n              sidebarRight = services.sidebarRight\n            })\n            ctx.inject([\"layout\"], (services) => {\n              layoutService = services.layout\n            })\n          }\n        } catch (error) {\n          console.warn(\"[DSH-library] sidebarRight injection skipped:\", error)\n        }\n\n        // dsh-resource://file/session/<sid>/<path>：逐段 encodeURIComponent，盘符的冒号保持字面。\n        const addressSegment = (segment) => encodeURIComponent(String(segment)).replace(/%3A/gi, \":\")\n        const sessionFileAddress = (sessionId, path) => {\n          const normalized = String(path || \"\").replace(/\\\\/g, \"/\").replace(/^(?:\\.\\/)+/, \"\")\n          const encoded = normalized.split(\"/\").map(addressSegment).join(\"/\")\n          return \"dsh-resource://file/session/\" + addressSegment(sessionId) + \"/\" + encoded\n        }\n        const mountedSessionId = (service) => {\n          try {\n            const value = service && service.mounted && service.mounted.getSnapshot ? service.mounted.getSnapshot() : \"\"\n            return typeof value === \"string\" ? value : \"\"\n          } catch {\n            return \"\"\n          }\n        }\n\n        /**\n         * 交给 DSH 自带的文档预览标签页：markdown / 图片 / PDF / Office / 代码都由它挑渲染器。\n         * 拿不到服务（旧版 DSH）或拿不到会话时返回 false，面板那边会退回自己的只读预览。\n         */\n        const openDocument = async (item) => {\n          const id = String(item && item.id ? item.id : \"\")\n          if (!id) return false\n          const service = clientService(\"sidebarRight\", sidebarRight)\n          if (!service || typeof service.openResource !== \"function\") return false\n          const layout = clientService(\"layout\", layoutService)\n          try {\n            const snapshot = layout && layout.panelInfo && layout.panelInfo.getSnapshot ? layout.panelInfo.getSnapshot() : null\n            if (snapshot && snapshot.activePanelId) layout.selectPanel(null)\n          } catch (error) {\n            console.warn(\"[DSH-library] selectPanel failed:\", error)\n          }\n          let data\n          try {\n            data = await panelApi(\"/open-path?id=\" + encodeURIComponent(id), { method: \"POST\" })\n          } catch (error) {\n            console.warn(\"[DSH-library] open-path failed:\", error)\n            return false\n          }\n          const target = String(data && data.path ? data.path : \"\")\n          if (!target) return false\n          // 切回对话之后右侧栏才认得出当前会话；面板刚切换时可能晚一帧，短暂重试。\n          let sessionId = mountedSessionId(service)\n          for (let attempt = 0; attempt < 6 && !sessionId; attempt += 1) {\n            await new Promise((resolve) => setTimeout(resolve, 40))\n            sessionId = mountedSessionId(service)\n          }\n          if (!sessionId) return false\n          try {\n            service.openResource(sessionFileAddress(sessionId, target))\n            return true\n          } catch (error) {\n            console.warn(\"[DSH-library] openResource failed:\", error)\n            return false\n          }\n        }\n        const Section = makeSettings({ useState, useEffect, useCallback, useRef, t })",
    "apply: uiWorkspace + openDocument"
  )

  // 3) settings.section 之后追加 main + sidebar.panellist
  const iconEffect = `        ctx.effect(() => {
          try {
            return installNavIcon(() => t('nav'))
          } catch (error) {
            // 图标只是锦上添花，DOM 结构和 DSH 版本相关，失败就沿用默认齿轮。
            console.warn('[DSH-library] nav icon skipped:', error)
            return () => {}
          }
        }, 'DSH-library: settings nav icon')
`
  client = replaceOnce(
    client,
    iconEffect,
    `${iconEffect}
        // ── 侧栏入口 + 主面板 ────────────────────────────────────────────
        // 侧栏那个图标的 id 就是 main 槽里选中哪个面板的 key，两者必须用同一个字符串，
        // DSH 靠它把「点图标」和「渲染哪块面板」对上。
        injectPanelCss(typeof document === 'undefined' ? undefined : document)
        const Panel = makePanel({ useState, useEffect, useCallback, useRef, language, jumpToSession, openDocument })
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
