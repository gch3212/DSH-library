/**
 * 工具层自测：确认 4 个 library_* 工具给 agent 看的文本里，
 * 带上了「文件夹位置」和「用户备注」——这是需求 2 里"备注要能被阅读并辅助思考"的落点。
 *
 * 运行：
 *   export DSH_DESKTOP_NODE_EXECUTABLE="D:\\Apps\\Deepseek Harness\\DeepSeek Harness.exe"
 *   export ELECTRON_RUN_AS_NODE=1
 *   "/d/Apps/Deepseek Harness/DeepSeek Harness.exe" test/tools.e2e.mjs
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'll-tools-'))
process.env.DSH_HOME = home

const plugin = await import('../lib/index.js')

const tools = new Map()
let prompt = ''
const stubCtx = {
  effect: (fn) => {
    const off = fn()
    if (typeof off === 'function') off()
  },
  webServer: { register: () => {} },
  tools: {
    register: (definition) => {
      tools.set(definition.name, definition)
      return () => {}
    }
  },
  systemPrompt: {
    section: (value) => {
      prompt = typeof value === 'function' ? String(value() ?? '') : String(value?.text ?? value ?? '')
      return () => {}
    }
  }
}
plugin.apply(stubCtx, {})

const failures = []
const check = (label, ok, detail) => {
  if (ok) console.log(`  ✓ ${label}`)
  else {
    failures.push(label)
    console.log(`  ✗ ${label}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  }
}

const render = (name, value) => {
  const tool = tools.get(name)
  const out = tool.output?.render?.(value.__args || {}, value)
  const texts = Array.isArray(out) ? out.map((row) => row.text || '') : []
  return texts.join('\n')
}

// ── 存一个文件到「论文/2026」，带备注 ────────────────────────────────────
const saved = await tools.get('library_save').execute({
  name: '光合作用笔记.md',
  content: '光反应在类囊体膜上进行，暗反应在基质中固碳。',
  tags: ['植物学'],
  folder: '论文/2026',
  remark: '导师说这段要放进综述第二节'
})
check('library_save 成功', saved?.saved === true, saved)
check('library_save 记住了文件夹', saved?.folderPath === '论文/2026', saved?.folderPath)

// ── library_list ────────────────────────────────────────────────────────
const listed = await tools.get('library_list').execute({})
const listText = render('library_list', listed)
check('library_list 输出位置', listText.includes('位置：论文/2026'), listText)
check('library_list 输出备注', listText.includes('导师说这段要放进综述第二节'), listText)
check('library_list 列出文件夹清单', /文件夹（2 个/.test(listText) && listText.includes('论文/2026/'), listText)

// ── library_search：备注和文件夹名也能命中 ──────────────────────────────
const byRemark = await tools.get('library_search').execute({ query: '综述第二节' })
check('用备注能搜到文件', byRemark.results?.length === 1, byRemark.results)
const searchText = render('library_search', byRemark)
check('检索结果带位置行', searchText.includes('位置') && searchText.includes('论文/2026'), searchText)
check('检索结果带备注行', searchText.includes('备注：导师说这段'), searchText)

const byFolder = await tools.get('library_search').execute({ query: '论文' })
check('用文件夹名能搜到文件', (byFolder.results || []).length >= 1, byFolder.results?.map?.((r) => r.name))

// ── library_read：正文 + 位置 + 备注，并记账访问 ────────────────────────
const readBack = await tools.get('library_read').execute({ id: saved.id })
check('library_read 读到正文', String(readBack.text || '').includes('光反应'), readBack.text)
check('library_read 带文件夹路径', readBack.folderPath === '论文/2026', readBack.folderPath)
check('library_read 带备注', String(readBack.remark || '').includes('综述第二节'), readBack.remark)
const readText = render('library_read', readBack)
check('library_read 文本里有位置/备注', readText.includes('位置') && readText.includes('备注'), readText)

const recent = await tools.get('library_read').__proto__ ? null : null
void recent

// 访问记录：再 list 一次应该能看到 lastAccessAt 已经写上（store 侧）
const afterList = await tools.get('library_list').execute({})
const row = (afterList.items || []).find((item) => item.id === saved.id)
check('读过之后列表里的文件还在', Boolean(row), afterList.items)
const accessText = render('library_list', afterList)
check('列表文本没有 undefined', !accessText.includes('undefined'), accessText)

// ── 系统提示词：要让 agent 知道备注要当真读 ─────────────────────────────
check('提示词提到备注', /备注/.test(prompt), prompt.slice(-300))
check('提示词提到文件夹', /文件夹/.test(prompt), prompt.slice(-300))

// ── 空库场景 ───────────────────────────────────────────────────────────
const emptyHome = await mkdtemp(join(tmpdir(), 'll-tools-empty-'))
process.env.DSH_HOME = emptyHome
const plugin2 = await import(`../lib/index.js?empty=${Date.now()}`)
const tools2 = new Map()
plugin2.apply({
  effect: (fn) => {
    const off = fn()
    if (typeof off === 'function') off()
  },
  webServer: { register: () => {} },
  tools: {
    register: (definition) => {
      tools2.set(definition.name, definition)
      return () => {}
    }
  },
  systemPrompt: { section: () => () => {} }
}, {})
const emptyList = await tools2.get('library_list').execute({})
const emptyText = tools2.get('library_list').output.render({}, emptyList).map((r) => r.text).join('\n')
check('空库提示正常', emptyList.empty === true && /空的/.test(emptyText), emptyText)

console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
