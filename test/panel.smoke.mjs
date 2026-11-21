/**
 * 面板冒烟测试：把 lib/client.js 拉到假 ctx 里跑一遍 apply()，
 * 确认侧栏入口 / 主面板都注册上了，再把面板在各种数据下渲染出来看结构。
 *
 * 面板没有构建步骤、又不是 react-dom 环境，所以这里用 test/mini-render.mjs 里的
 * 迷你渲染器摊平元素树，只断言类名与文案（够用：崩了、少一块、文案串了都能抓到）。
 *
 * 运行：
 *   export DSH_DESKTOP_NODE_EXECUTABLE="D:\\Apps\\Deepseek Harness\\DeepSeek Harness.exe"
 *   export ELECTRON_RUN_AS_NODE=1
 *   "/d/Apps/Deepseek Harness/DeepSeek Harness.exe" test/panel.smoke.mjs
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tryProfileRequire } from './profile.mjs'
import vm from 'node:vm'
import { walk, textOf, classesOf } from './mini-render.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// 面板只需要 react.createElement（hooks 全部由下面的假 react 接管），
// 所以有 DSH profile 就用真的，没有（CI / 干净机器）就用一个最小实现，测照跑。
let React = null
try {
  const found = tryProfileRequire(['react'])
  if (!found.error) React = found.modules.react
} catch {
  React = null
}
if (!React) {
  React = {
    createElement(type, props, ...children) {
      const rest = { ...(props || {}) }
      const key = rest.key === undefined ? null : rest.key
      delete rest.key
      if (children.length === 1) rest.children = children[0]
      else if (children.length > 1) rest.children = children
      return { type, key, props: rest }
    }
  }
  console.log('NOTE 本机没有可用的 DSH profile，react 用最小实现：只验结构，不验真渲染')
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS ${name}`)
  else {
    failures += 1
    console.log(`FAIL ${name}${detail ? ` → ${detail}` : ''}`)
  }
}

// ── 假 document：记住插进去的 <style>，好断言 CSS 只注入一次 ──────────────
const styles = []
const fakeDoc = {
  head: {
    appendChild(node) {
      styles.push(node)
    }
  },
  body: null,
  createElement() {
    return { dataset: {}, textContent: '' }
  },
  querySelector(selector) {
    const match = /style\[data-plugin-css="(.+)"\]/.exec(selector)
    if (!match) return null
    return styles.find((row) => row.dataset && row.dataset.pluginCss === match[1]) || null
  },
  querySelectorAll: () => []
}
globalThis.document = fakeDoc
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })

// ── 假 fetch：按 URL 回放固定数据 ───────────────────────────────────────
const treePayload = {
  folders: [
    { id: 'lf-a', name: '论文', parentId: '', path: '论文', remark: '2026 投稿材料' },
    { id: 'lf-b', name: '2026', parentId: 'lf-a', path: '论文/2026', remark: '' }
  ],
  items: [
    {
      id: 'll-1',
      name: '植物笔记.md',
      kind: 'text',
      size: 2048,
      folderId: 'lf-a',
      folderPath: '论文',
      remark: '光合作用的关键段落',
      addedBy: 'agent',
      createdAt: '2026-10-30T09:00:00.000Z',
      updatedAt: '2026-10-30T09:30:00.000Z',
      lastAccessAt: '2026-10-30T10:00:00.000Z',
      accessCount: 3
    }
  ],
  stats: { root: 'C:/lib', count: 1, bytes: 2048, indexed: 1, folders: 2 },
  pending: 0
}
const fetchLog = []
const openPath = 'D:/DSH Data/Home/local-library/open/ll-1/植物笔记.md'
globalThis.fetch = async (url) => {
  fetchLog.push(String(url))
  const send = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) })
  if (String(url).includes('/open-path')) return send({ path: openPath, name: '植物笔记.md' })
  if (String(url).includes('/tree')) return send(treePayload)
  if (String(url).includes('/recent')) return send({ items: [treePayload.items[0]] })
  if (String(url).includes('/workfiles')) {
    return send({
      files: [
        {
          sessionId: 'session-abc',
          sessionTitle: '论文文献整理',
          cwd: 'D:\\DSH Place',
          path: 'D:\\DSH Place\\work\\CC-COM-1117.docx',
          name: 'CC-COM-1117.docx',
          description: '已插入 17 篇文献',
          kind: 'deliverable',
          turn: 3,
          at: 1761800000000,
          exists: true,
          size: 12345
        }
      ],
      sessions: []
    })
  }
  return send({})
}

// ── 载入客户端脚本 ──────────────────────────────────────────────────────
const code = await readFile(join(here, '..', 'lib', 'client.js'), 'utf8')
let loaded
globalThis.window = { __ModuleLoader__: { load: (options) => (loaded = options) } }

const seeds = []
let cursor = 0
let stackName = 'panel'
const createElement = (type, props, ...children) => {
  for (const child of children) {
    if (!Array.isArray(child)) continue
    const unkeyed = child.filter((x) => x && typeof x === 'object' && (x.key === null || x.key === undefined))
    if (unkeyed.length > 0) {
      const line = String(new Error('probe').stack || '')
        .split('\n')
        .find((row) => row.includes('client.js:'))
      console.log(`WARN 未加 key 的子元素数组在 <${String(type)}>（${stackName}）→ ${line && line.trim()}`)
    }
  }
  return React.createElement(type, props, ...children)
}

const fakeReact = {
  ...React,
  createElement,
  // 面板是一整个大组件，state 只能按调用顺序喂；顺序在下面的 SLOT 表里写死，
  // 一旦有人在中途插了新 useState，这里会立刻表现为断言失败（这是故意的）。
  useState(initial) {
    const index = cursor
    cursor += 1
    const value = index < seeds.length ? seeds[index] : initial
    if (value === '__FROM_INITIAL__') return [initial, () => {}]
    return [value, () => {}]
  },
  useEffect() {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value === undefined ? null : value })
}

try {
  vm.runInThisContext(code, { filename: 'client.js' })
} catch (error) {
  check('client.js 可执行', false, error.stack || error.message)
  process.exit(1)
}

let mod
try {
  mod = loaded.factory((name) => {
    if (name === 'react') return fakeReact
    throw new Error(`unexpected require(${name})`)
  })
} catch (error) {
  check('工厂可执行', false, error.stack)
  process.exit(1)
}

// ── 假 ctx ────────────────────────────────────────────────────────────
const registrations = []
const openedSessions = []
const openedDocs = []
const selectedPanels = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  locale: { register: () => () => {} },
  inject(names, callback) {
    // 客户端服务在这里注入：uiWorkspace 验「定位到聊天」，sidebarRight + layout 验「交给文档面板」。
    callback({
      uiWorkspace: { openSession: (id) => openedSessions.push(id) },
      sidebarRight: {
        mounted: { getSnapshot: () => 'session-test' },
        openResource: (address) => openedDocs.push(address)
      },
      layout: {
        panelInfo: { getSnapshot: () => ({ activePanelId: 'local-library' }) },
        selectPanel: (id) => selectedPanels.push(id)
      }
    })
  },
  slots: {
    inject(name, generator) {
      for (const entry of generator()) registrations.push({ slot: name, entry })
    },
    register(options, component) {
      return { options, component }
    }
  }
}

try {
  mod.apply(ctx)
} catch (error) {
  check('apply() 不抛异常', false, error.stack || error.message)
  process.exit(1)
}
check('apply() 不抛异常', true)
check('注入了面板样式', styles.some((row) => row.dataset.pluginCss === 'dsh-local-library/panel.css'), `styles=${styles.length}`)

// CSS 只该插一次
const before = styles.length
mod.apply(ctx)
check('重复 apply 不重复插样式', styles.length === before, `${before} → ${styles.length}`)

const slots = registrations.map((row) => row.slot)
check('注册了 settings.section', slots.includes('settings.section'), slots.join(','))
check('注册了 main', slots.includes('main'), slots.join(','))
check('注册了 sidebar.panellist', slots.includes('sidebar.panellist'), slots.join(','))

const mainEntry = registrations.find((row) => row.slot === 'main').entry
const iconEntry = registrations.find((row) => row.slot === 'sidebar.panellist').entry
check('main 的 key 是 local-library', mainEntry.options.key === 'local-library', String(mainEntry.options.key))
check('侧栏 id 与 main key 一致', iconEntry.options.id === mainEntry.options.key, `${iconEntry.options.id} vs ${mainEntry.options.key}`)
check('侧栏有 order', typeof iconEntry.options.order === 'number', String(iconEntry.options.order))
check('侧栏有中文 label', iconEntry.options.label() === '本地资料库', iconEntry.options.label())

const Panel = mainEntry.component
const Icon = iconEntry.component

// ── 侧栏图标 ──────────────────────────────────────────────────────────
const iconParts = walk(Icon({}))
const iconHtml = textOf(iconParts)
check('侧栏图标是 svg', iconParts.some((p) => p.tag === 'svg'), iconHtml.slice(0, 120))
check('侧栏图标用调用方给的尺寸', (() => {
  const big = walk(Icon({ size: 22 }))
  return big[0] && big[0].tag === undefined ? false : true
})())

// ── 渲染各种数据 ──────────────────────────────────────────────────────
const SLOT = {
  tab: 0,
  folderId: 1,
  tree: 2,
  recent: 3,
  work: 4,
  query: 5,
  hits: 6,
  expanded: 7,
  preview: 8,
  editing: 9,
  editValue: 10,
  creating: 11,
  dragOver: 12,
  dragging: 13,
  fileOver: 14,
  notice: 15,
  busy: 16,
  pending: 17,
  previewLoading: 18,
  selected: 19,
  anchorId: 20,
  moveMenu: 21,
  batchDraft: 22
}

function baseSeeds() {
  const list = []
  list[SLOT.tab] = 'all'
  list[SLOT.folderId] = ''
  list[SLOT.tree] = null
  list[SLOT.recent] = null
  list[SLOT.work] = null
  list[SLOT.query] = ''
  list[SLOT.hits] = null
  list[SLOT.expanded] = []
  list[SLOT.preview] = null
  list[SLOT.editing] = null
  list[SLOT.editValue] = ''
  list[SLOT.creating] = null
  list[SLOT.dragOver] = ''
  list[SLOT.dragging] = []
  list[SLOT.fileOver] = false
  list[SLOT.notice] = null
  list[SLOT.busy] = ''
  list[SLOT.pending] = []
  list[SLOT.previewLoading] = false
  list[SLOT.selected] = []
  list[SLOT.anchorId] = null
  list[SLOT.moveMenu] = false
  list[SLOT.batchDraft] = null
  return list
}

function render(overrides = {}) {
  const list = baseSeeds()
  for (const [key, value] of Object.entries(overrides)) {
    const index = SLOT[key]
    if (index === undefined) throw new Error(`unknown slot ${key}`)
    list[index] = value
  }
  seeds.length = 0
  seeds.push(...list)
  cursor = 0
  const element = Panel({})
  const parts = walk(element)
  return { element, parts, classes: classesOf(parts), text: textOf(parts) }
}

// 首屏（还没拉到数据）
{
  const { classes, text } = render()
  check('渲染出整体骨架', classes.has('llp-root') && classes.has('llp-side') && classes.has('llp-main'))
  check('侧栏有三个入口', text.includes('全部文件') && text.includes('最近访问') && text.includes('工作生成文件'), text.slice(0, 160))
  check('有上传按钮', text.includes('上传文件') && text.includes('上传文件夹'))
  check('空态提示', classes.has('llp-empty'))
}

// 全部文件：文件夹树 + 文件行 + 备注
{
  const { classes, text } = render({
    tree: treePayload,
    folderId: 'lf-a',
    expanded: ['', 'lf-a', 'lf-b']
  })
  check('树里有文件夹', classes.has('llp-folder') && text.includes('论文') && text.includes('2026'))
  check('文件夹备注显示出来', text.includes('2026 投稿材料'), text.slice(0, 400))
  check('文件行渲染', classes.has('llp-row') && text.includes('植物笔记.md'))
  check('文件备注显示在行里', text.includes('光合作用的关键段落'))
  check('行里带文件夹路径', text.includes('论文'))
  check('agent 保存的标记', text.includes('agent 存入'), text.slice(0, 800))
  check('有改名/备注/下载/删除按钮', ['改名', '备注', '下载', '删除'].every((word) => text.includes(word)), text.slice(0, 600))
  check('侧栏文件夹计数', /\d+\s*个文件夹/.test(text), text.slice(0, 200))
}

// 最近访问
{
  const { text } = render({ tab: 'recent', recent: treePayload.items })
  check('最近访问列出文件', text.includes('植物笔记.md'))
  check('最近访问带访问次数', /访问\s*3\s*次|3\s*次/.test(text) || text.includes('论文'), text.slice(0, 400))
}

// 工作生成文件 + 定位到聊天
{
  const rendered = render({ tab: 'work', work: { files: [{
    sessionId: 'session-abc',
    sessionTitle: '论文文献整理',
    cwd: 'D:\\DSH Place',
    path: 'D:\\DSH Place\\work\\CC-COM-1117.docx',
    name: 'CC-COM-1117.docx',
    description: '已插入 17 篇文献',
    kind: 'deliverable',
    turn: 3,
    at: 1761800000000,
    exists: true,
    size: 12345
  }], sessions: [] } })
  const { classes, text } = rendered
  check('按会话分组', classes.has('llp-grouphead') && text.includes('论文文献整理'))
  check('显示文件名', text.includes('CC-COM-1117.docx'))
  check('显示会话产出数量', text.includes('1') )
  check('有定位按钮', text.includes('定位到聊天'), text.slice(0, 500))
  check('有存入资料库按钮', text.includes('存入资料库'), text.slice(0, 500))
  check('显示交付物标记', text.includes('交付'), text.slice(0, 600))

  // 定位按钮真的调到 uiWorkspace.openSession
  const goBtn = (function find(node) {
    if (!node) return null
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    if (typeof node === 'function') return find(node({}))
    if (typeof node === 'object') {
      const props = node.props || {}
      if (typeof props.onClick === 'function' && typeof props.children === 'string' && props.children === '定位到聊天') {
        return props.onClick
      }
      return find(props.children)
    }
    return null
  })(rendered.element)
  if (goBtn) {
    openedSessions.length = 0
    goBtn()
    check('点定位会打开会话', openedSessions.includes('session-abc'), openedSessions.join(','))
  } else {
    check('点定位会打开会话', false, '没找到定位按钮的 onClick')
  }
}

// 检索结果
{
  const { text } = render({
    tree: treePayload,
    query: '光合',
    hits: [treePayload.items[0]]
  })
  check('检索结果里带备注', text.includes('光合作用的关键段落'))
}

// 预览面板
{
  const { classes, text } = render({
    tree: treePayload,
    preview: { item: treePayload.items[0], text: '正文摘要…', total: 128 }
  })
  check('预览面板出现', classes.has('llp-preview'), [...classes].filter((c) => c.startsWith('llp-p')).join(','))
  check('预览显示正文', text.includes('正文摘要…'))
  check('预览显示备注', text.includes('光合作用的关键段落'))
}

// 新建文件夹输入行
{
  const { classes } = render({ tree: treePayload, creating: { parentId: '', name: '' } })
  check('新建文件夹输入行', classes.has('llp-editrow') && classes.has('llp-input'))
}

// 提示条
{
  const { classes, text } = render({ tree: treePayload, notice: { text: '已保存', isError: false } })
  check('提示条能显示', classes.has('llp-toast') && text.includes('已保存'), [...classes].join(','))
}

// 全量文案体检
{
  const { text } = render({
    tree: treePayload,
    expanded: ['', 'lf-a'],
    preview: { item: treePayload.items[0], text: 'x', total: 1 }
  })
  check('没有 undefined 文案', !text.includes('undefined'), (text.match(/undefined/g) || []).length + ' 处')
  check('没有未翻译的 key（llp 文案里不该出现驼峰键名）', !/\b(panelTitle|allFiles|emptyRoot|folderNamePlaceholder)\b/.test(text), '')
}

// 多选：每行前面有复选框
{
  const { classes } = render({ tree: treePayload, folderId: 'lf-a', expanded: ['', 'lf-a'] })
  check('文件行前有复选框', classes.has('llp-check'), [...classes].filter((c) => c.startsWith('llp-c')).join(','))
}

// 选中之后出现批量操作条
{
  const { classes, text } = render({ tree: treePayload, expanded: ['', 'lf-a'], selected: ['ll-1'] })
  check('出现批量操作条', classes.has('llp-batch'), [...classes].filter((c) => c.startsWith('llp-b')).join(','))
  check('显示已选数量', text.includes('已选 1 项'), text.slice(0, 400))
  check('批量条按钮齐全', ['全选', '移到…', '批量备注', '打包下载', '删除 1 项', '取消选择'].every((word) => text.includes(word)), text.slice(0, 600))
}

// 批量移动：展开目标文件夹菜单
{
  const { classes, text } = render({
    tree: treePayload,
    expanded: ['', 'lf-a'],
    selected: ['ll-1'],
    moveMenu: true
  })
  check('移动菜单列出根目录', text.includes('资料库根目录'), text.slice(0, 500))
  check('移动菜单列出文件夹路径', text.includes('论文/2026'), text.slice(0, 500))
  check('移动菜单有样式', classes.has('llp-movemenu') && classes.has('llp-moveopt'))
}

// 批量备注：输入框 + 追加提示
{
  const { classes, text } = render({ tree: treePayload, selected: ['ll-1'], batchDraft: '' })
  check('批量备注输入框', classes.has('llp-batchremark'), [...classes].filter((c) => c.startsWith('llp-ba')).join(','))
  check('批量备注提示追加', text.includes('追加到每份文件已有的备注后面'), text.slice(0, 500))
  check('批量备注有写入按钮', text.includes('写入备注'))
}

// 面板里不再自带编辑器（交给 DSH 自带的文档面板）
{
  const { classes, text } = render({
    tree: treePayload,
    preview: { item: treePayload.items[0], text: '正文摘要…', total: 6 }
  })
  check('预览里没有自写的编辑器', !classes.has('llp-editor') && !text.includes('Ctrl+S'))
  check('预览仍然给出正文', classes.has('llp-pvtext') && text.includes('正文摘要'), text.slice(0, 400))
}

// 点文件 → 先交给 DSH 文档面板（layout 切回对话 + sidebarRight.openResource）
{
  const { element } = render({ tree: treePayload, folderId: 'lf-a' })
  const rows = []
  const collect = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(collect)
      return
    }
    if (node.props && node.props.onClick && String(node.props.className || '').includes('llp-row') && !String(node.props.className || '').includes('llp-folder')) rows.push(node)
    const kids = node.props ? node.props.children : null
    if (kids) collect(kids)
  }
  collect(element)
  check('文件行可点击', rows.length > 0, String(rows.length))
  selectedPanels.length = 0
  openedDocs.length = 0
  // 文件夹行和文件行都用 .llp-row：文件夹先渲染，所以文件是最后一个。
  rows[rows.length - 1].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('点文件先把主区域切回对话', selectedPanels.includes(null), JSON.stringify(selectedPanels))
  check('点文件交给 DSH 文档面板', openedDocs.length === 1, JSON.stringify(openedDocs))
  check(
    '地址是 session 作用域的文件地址',
    openedDocs[0] === 'dsh-resource://file/session/session-test/D:/DSH%20Data/Home/local-library/open/ll-1/%E6%A4%8D%E7%89%A9%E7%AC%94%E8%AE%B0.md',
    openedDocs[0]
  )
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
