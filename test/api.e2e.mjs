/**
 * 端到端自测：把宿主半侧的 HTTP 路由真跑起来（真 http server + 真 store），
 * 覆盖文件夹树、拖文件夹上传保留结构、备注、移动、最近访问、预览、工作生成文件。
 *
 * 用法（本机）：
 *   export DSH_DESKTOP_NODE_EXECUTABLE="D:\\Apps\\Deepseek Harness\\DeepSeek Harness.exe"
 *   export ELECTRON_RUN_AS_NODE=1
 *   "/d/Apps/Deepseek Harness/DeepSeek Harness.exe" test/api.e2e.mjs
 */
import http from 'node:http'
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'

const home = await mkdtemp(join(tmpdir(), 'll-home-'))
process.env.DSH_HOME = home

const plugin = await import('../lib/index.js')
const routes = []
const stubCtx = {
  effect: (fn) => {
    const off = fn()
    if (typeof off === 'function') off()
  },
  webServer: { register: (definition) => routes.push(definition) },
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {} }
}
plugin.apply(stubCtx, {})

if (routes.length !== 1) throw new Error(`expected 1 route, got ${routes.length}`)

const server = http.createServer((req, res) => routes[0].handler(req, res))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/dsh-local-library`

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    failures.push(label)
    console.log(`  ✗ ${label}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  }
}

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, json, text }
}

console.log(`\n[1] 空库 /tree`)
let tree = await call('GET', '/tree')
check('status 200', tree.status === 200, tree)
check('folders 为空', Array.isArray(tree.json?.folders) && tree.json.folders.length === 0)
check('items 为空', Array.isArray(tree.json?.items) && tree.json.items.length === 0)
check('stats.folders 存在', typeof tree.json?.stats?.folders === 'number', tree.json?.stats)

console.log(`\n[2] 建文件夹：论文 → 2026`)
const root = await call('POST', '/folder', { name: '论文', remark: '我的学术材料' })
check('建根目录 200', root.status === 200, root)
check('名字正确', root.json?.folder?.name === '论文', root.json)
const nested = await call('POST', '/folder', { name: '2026', parentId: root.json?.folder?.id })
check('建子目录 200', nested.status === 200, nested)
check('path 是 论文/2026', nested.json?.folder?.path === '论文/2026', nested.json?.folder)
const again = await call('POST', '/folder', { name: '2026', parentId: root.json?.folder?.id })
check('同层同名返回同一个', again.json?.folder?.id === nested.json?.folder?.id, again.json?.folder)

console.log(`\n[3] 拖文件夹上传（带相对路径，自动建目录链）`)
const uploadA = await call('POST', '/upload?name=%E7%AC%94%E8%AE%B0.md&path=%E8%AE%BA%E6%96%87%2F2026%2F%E7%AC%94%E8%AE%B0.md', {
  x: 1
})
check('上传 200', uploadA.status === 200, uploadA)
check('落进了 论文/2026', uploadA.json?.item?.folderPath === '论文/2026', uploadA.json?.item)
const uploadB = await call('POST', '/upload?name=b.md&path=%E8%AE%BA%E6%96%87%2F%E7%AC%94%E8%AE%B0.md', { y: 2 })
check('另一个目录', uploadB.json?.item?.folderPath === '论文', uploadB.json?.item)

// 拖进「某个文件夹里的整个目录」：层次要长在那个文件夹下面，而不是根目录。
const paperId = root.json?.folder?.id
const uploadNested = await call(
  'POST',
  `/upload?name=n.md&folder=${encodeURIComponent(paperId)}&path=%E6%8A%95%E7%A8%BF%2Fn.md`,
  { z: 3 }
)
check('上传到子文件夹 200', uploadNested.status === 200, uploadNested)
check(
  '落在 论文/投稿 而不是 投稿',
  uploadNested.json?.item?.folderPath === '论文/投稿',
  uploadNested.json?.item
)

console.log(`\n[4] 备注 + 改名（PATCH /item）`)
const itemId = uploadA.json?.item?.id
const patched = await call('PATCH', `/item?id=${itemId}`, { remark: '导师改过的版本，第三节有问题', name: '笔记-v2.md' })
check('改名生效', patched.json?.item?.name === '笔记-v2.md', patched.json?.item)
check('备注生效', /导师改过/.test(patched.json?.item?.remark || ''), patched.json?.item?.remark)
check('folderPath 还在', patched.json?.item?.folderPath === '论文/2026', patched.json?.item?.folderPath)

console.log(`\n[5] 备注 / 文件夹名参与检索（走工具同一套 search）`)
const store = (await import('../lib/store.js')).LibraryStore
const probe = new store(join(home, 'local-library'))
await probe.init()
const byRemark = await probe.search('导师改过')
check('按备注搜到', byRemark.length === 1 && byRemark[0].item.id === itemId, byRemark.map((h) => h.item.name))
const byFolder = await probe.search('论文')
check('按文件夹名搜到 3 条（论文 整棵子树）', byFolder.length === 3, byFolder.map((h) => h.item.name))

console.log(`\n[6] 预览 → 最近访问`)
let recent = await call('GET', '/recent')
check('还没访问过', recent.json?.items?.length === 0, recent.json?.items?.length)
const preview = await call('GET', `/preview?id=${itemId}`)
check('预览 200', preview.status === 200, preview)
check('拿到正文（md 存的是 JSON 体，不验证内容）', typeof preview.json?.text === 'string')
recent = await call('GET', '/recent')
check('现在有 1 条', recent.json?.items?.length === 1, recent.json?.items?.length)
check('accessCount = 1', recent.json?.items?.[0]?.accessCount === 1, recent.json?.items?.[0])

console.log(`\n[7] 移动 + 文件夹改名/遍历防护`)
const moved = await call('POST', '/move', { ids: [itemId], folderId: root.json?.folder?.id })
check('移动成功', moved.json?.moved?.length === 1, moved.json)
tree = await call('GET', '/tree')
check('条目的 folderPath 变成 论文', tree.json?.items?.find((it) => it.id === itemId)?.folderPath === '论文', tree.json?.items)
const renameFolder = await call('PATCH', `/folder?id=${root.json?.folder?.id}`, { name: '学术资料' })
check('文件夹改名', renameFolder.json?.folder?.name === '学术资料', renameFolder.json?.folder)
const cycle = await call('PATCH', `/folder?id=${root.json?.folder?.id}`, { parentId: nested.json?.folder?.id })
check('不能把父目录挪进子目录', cycle.json?.folder?.parentId === '', cycle.json?.folder)

console.log(`\n[8] 删文件夹（默认内容上提）`)
// 先把 b.md 塞进 2026，删掉 2026 之后它应该上提到父目录 论文。
await call('POST', '/move', { ids: [uploadB.json?.item?.id], folderId: nested.json?.folder?.id })
const removed = await call('DELETE', `/folder?id=${nested.json?.folder?.id}`)
check('删除 200', removed.status === 200, removed)
// removeFolder 的返回值里要能看到"没有连文件一起删"，否则用户会担心文件没了。
check('保留文件（removedItems=0）', removed.json?.removedItems === 0, removed.json)
tree = await call('GET', '/tree')
check('子目录没了', !tree.json.folders.some((f) => f.id === nested.json?.folder?.id))
check(
  '里面的文件上提到父目录',
  tree.json?.items?.find((it) => it.id === uploadB.json?.item?.id)?.folderPath === '学术资料',
  tree.json?.items
)

console.log(`\n[9] 递归删`)
const gone = await call('DELETE', `/folder?id=${root.json?.folder?.id}&recursive=1`)
check('递归删 200', gone.status === 200, gone)
tree = await call('GET', '/tree')
check('剩下 0 个文件夹', tree.json.folders.length === 0, tree.json.folders.map((f) => f.name))

console.log(`\n[10] 把磁盘上的文件收进库（import-path）`)
const outside = join(home, 'outside-report.md')
await writeFile(outside, '# 外部文件\n\n正文一段。', 'utf8')
const imported = await call('POST', '/import-path', { path: outside, remark: '外部生成的报表' })
check('导入 200', imported.status === 200, imported)
check('备注带上', imported.json?.item?.remark === '外部生成的报表', imported.json?.item)

console.log(`\n[11] 工作生成文件（合成的会话日志）`)
// 自己造一份迷你会话日志，不依赖本机真实会话：公开仓库里不该出现作者的路径，
// 也让这套测试在 CI 上能真的跑起来。日志格式见 lib/sessions.js 顶部注释：
// 一串独立的 zstd frame，每个 frame 里是若干行 JSONL 事件。
const sessionId = 'session-5f00d000-0000-4000-8000-abcdefabcdef'
const sessionDir = join(home, 'sessions', '--tmp-work--', sessionId)
await mkdir(sessionDir, { recursive: true })
const deliveredPath = join(home, 'out', '季度报告.docx')
const writtenPath = join(home, 'out', 'notes.md')
await mkdir(dirname(deliveredPath), { recursive: true })
await writeFile(deliveredPath, 'docx-bytes', 'utf8')
await writeFile(writtenPath, '# 笔记\n', 'utf8')
const now = Date.now()
const frames = [
  [{ type: 'session', version: 4, id: sessionId, createdAt: now - 60000, cwd: join(home, 'out') }],
  [
    { type: 'session/title', seq: 3, time: now - 50000, data: { title: '季度汇报整理' } },
    {
      type: 'deliverables/presented',
      seq: 7,
      time: now - 40000,
      data: { turn: 2, callId: 'c1', files: [{ path: deliveredPath, description: '按导师意见改过的一版' }] }
    }
  ],
  [
    {
      type: 'tool/call',
      seq: 9,
      time: now - 30000,
      data: { turn: 3, step: 1, callId: 'c2', name: 'write', arguments: JSON.stringify({ path: writtenPath }) }
    }
  ]
]
const encodeFrame = (records) =>
  zstdCompressSync(Buffer.from(records.map((record) => JSON.stringify(record)).join('\n') + '\n'))
await writeFile(
  join(sessionDir, 'session.v4.jsonl.zstd'),
  Buffer.concat(frames.map((records) => encodeFrame(records)))
)

const work = await call('GET', '/workfiles?limit=5')
check('status 200', work.status === 200, work.status)
check('返回 files 数组', Array.isArray(work.json?.files), typeof work.json?.files)
const rows = work.json?.files || []
check('解析出 2 个文件（交付物 + 写入）', rows.length === 2, rows.map((row) => `${row.name}:${row.kind}`))
const delivered = rows.find((row) => row.path === deliveredPath)
check('交付物 kind=deliverable', delivered?.kind === 'deliverable', delivered?.kind)
check('交付物带说明', delivered?.description === '按导师意见改过的一版', delivered?.description)
check('带 sessionId（能定位到聊天）', delivered?.sessionId === sessionId, delivered?.sessionId)
check('带会话标题', delivered?.sessionTitle === '季度汇报整理', delivered?.sessionTitle)
check('文件在磁盘上 → exists', delivered?.exists === true, delivered)
const written = rows.find((row) => row.path === writtenPath)
check('写入文件 kind=write', written?.kind === 'write', written?.kind)
const sessionRows = work.json?.sessions || []
const sessionRow = sessionRows.find((row) => row.id === sessionId)
check('sessions 里有这条会话', Boolean(sessionRow), sessionRows)
check('会话 label 用标题', typeof sessionRow?.label === 'string' && sessionRow.label.includes('季度汇报'), sessionRow?.label)

// 会话里交付过、但磁盘上已经被删掉的文件，不该再挂在这里（与会话/磁盘的真实状态对齐）。
await unlink(writtenPath)
const workAfter = await call('GET', '/workfiles?limit=5')
const rowsAfter = workAfter.json?.files || []
check('磁盘文件被删后只剩 1 条', rowsAfter.length === 1, rowsAfter.map((row) => row.name))
check('被删的文件不再出现', !rowsAfter.some((row) => row.path === writtenPath), rowsAfter.map((row) => row.path))
check('还在的文件仍能列出', rowsAfter[0]?.path === deliveredPath, rowsAfter[0]?.path)

// 与 DSH 的会话状态同步：会话被归档（workspace.json 的 archivedSessionIds）后，它产出的文件也不该再出现。
await mkdir(join(home, 'storages'), { recursive: true })
await writeFile(
  join(home, 'storages', 'workspace.json'),
  JSON.stringify({ global: { archivedSessionIds: [sessionId] }, tables: { workspaces: {} } })
)
const workArchived = await call('GET', '/workfiles?limit=5')
check('会话归档后不再列出它的文件', (workArchived.json?.files || []).length === 0, workArchived.json?.files)
check('归档后 sessions 里也没有它', !(workArchived.json?.sessions || []).some((row) => row.id === sessionId), workArchived.json?.sessions)

// 会话被删除（没登记进任何工作区）同理：只剩日志目录也没用。
await writeFile(
  join(home, 'storages', 'workspace.json'),
  JSON.stringify({ global: { archivedSessionIds: [] }, tables: { workspaces: { w1: { sessionIds: ['session-other'] } } } })
)
const workOrphan = await call('GET', '/workfiles?limit=5')
check('未登记的会话不再列出', (workOrphan.json?.files || []).length === 0, workOrphan.json?.files)

// 恢复成「这个会话还活着」，后面的用例不受影响。
await writeFile(
  join(home, 'storages', 'workspace.json'),
  JSON.stringify({ global: { archivedSessionIds: [] }, tables: { workspaces: { w1: { sessionIds: [sessionId] } } } })
)

/* ── 12. 批量操作与就地编辑 ─────────────────────────────── */
{
  const created = await call('POST', '/upload?name=edit-me.md', Buffer.from('第一版正文', 'utf8'), 'text/markdown')
  const editId = created.json?.item?.id
  check('编辑用文件创建成功', Boolean(editId), created.status)

  const edited = await call('PUT', `/file?id=${encodeURIComponent(editId)}`, { text: '第二版正文\n多了一行' })
  check('PUT /file 状态 200', edited.status === 200, edited.status)
  check('PUT /file 回写正文', edited.json?.text === '第二版正文\n多了一行', edited.json?.text)
  check('PUT /file 更新了大小', edited.json?.item?.size === Buffer.byteLength('第二版正文\n多了一行', 'utf8'), edited.json?.item?.size)
  check('PUT /file 重置了索引', edited.json?.item?.indexed === true, edited.json?.item?.indexed)

  const reread = await call('GET', `/preview?id=${encodeURIComponent(editId)}&maxChars=200`)
  check('重新预览读到新正文', String(reread.json?.text || '').startsWith('第二版正文'), reread.json?.text)
  const found = await call('GET', `/list`)
  const afterEdit = (found.json?.items || []).find((row) => row.id === editId)
  check('列表里 textChars 跟着变', afterEdit?.textChars === '第二版正文\n多了一行'.length, afterEdit?.textChars)

  const binary = (found.json?.items || []).find((row) => row.kind !== 'text')
  if (binary) {
    const refused = await call('PUT', `/file?id=${encodeURIComponent(binary.id)}`, { text: '不该写进去' })
    check('二进制文件拒绝编辑 400', refused.status === 400 && refused.json?.error === 'not-editable', refused.json)
  }

  const second = await call('POST', '/upload?name=second.md', Buffer.from('另一份', 'utf8'), 'text/markdown')
  const secondId = second.json?.item?.id
  const remarked = await call('POST', '/remark', { ids: [editId, secondId], remark: '导师组会要用', mode: 'append' })
  check('POST /remark 更新 2 条', remarked.json?.updated === 2, remarked.json?.updated)
  const afterRemark = await call('GET', '/list')
  const noted = (afterRemark.json?.items || []).find((row) => row.id === editId)
  check('备注写进了条目', noted?.remark === '导师组会要用', noted?.remark)
  const appended = await call('POST', '/remark', { ids: [editId], remark: '再补一句', mode: 'append' })
  check('append 模式追加', appended.json?.updated === 1, appended.json?.updated)
  const twice = await call('GET', '/list')
  const note2 = (twice.json?.items || []).find((row) => row.id === editId)
  check('两次备注用换行拼起来', note2?.remark === '导师组会要用\n再补一句', note2?.remark)

  const deleted = await call('POST', '/delete', { ids: [editId, secondId] })
  check('POST /delete 删掉 2 个', deleted.json?.removed === 2, deleted.json?.removed)
  const empty = await call('POST', '/delete', { ids: [] })
  check('空选择 → 400', empty.status === 400 && empty.json?.error === 'empty-selection', empty.json)
  const goneList = await call('GET', '/list')
  check('删掉的条目不在列表里', !(goneList.json?.items || []).some((row) => row.id === editId), editId)
}

/* ── 13. 交给 DSH 文档面板：open-path 给出漂亮路径 ─────────── */
{
  const created = await call('POST', '/upload?name=论文 笔记.md', Buffer.from('正文', 'utf8'), 'text/markdown')
  const id = created.json?.item?.id
  check('open-path 用文件创建成功', Boolean(id), created.status)

  const opened = await call('POST', `/open-path?id=${encodeURIComponent(id)}`)
  check('POST /open-path 状态 200', opened.status === 200, opened.status)
  check('open-path 返回 name', opened.json?.name === '论文 笔记.md', opened.json?.name)
  const nicePath = String(opened.json?.path || '')
  check('open-path 使用用户起的名字', nicePath.endsWith('论文 笔记.md'), nicePath)
  check('open-path 落在 open/<id>/ 下', nicePath.includes(`open${sep}${id}${sep}`), nicePath)
  const info = await stat(nicePath).catch(() => null)
  check('open-path 指向真实文件', Boolean(info && info.isFile()), info)
  check('open-path 与库里那份同大小', info?.size === created.json?.item?.size, `${info?.size} vs ${created.json?.item?.size}`)

  const missing = await call('POST', '/open-path?id=nope')
  check('open-path 未知 id → 404', missing.status === 404 && missing.json?.error === 'not-found', missing.json)

  await call('POST', '/delete', { ids: [id] })
}

/* ── 14. 回收站：软删除 / 还原 / 彻底删除 / 清空 ─────────────── */
{
  const libRoot = join(home, 'local-library')
  const a = await call('POST', '/upload?name=软删除甲.txt', Buffer.from('甲的内容', 'utf8'), 'text/plain')
  const b = await call('POST', '/upload?name=软删除乙.txt', Buffer.from('乙的内容', 'utf8'), 'text/plain')
  const idA = a.json?.item?.id
  const idB = b.json?.item?.id
  check('回收站用例建好 2 个文件', Boolean(idA && idB), [idA, idB])

  // 前面的用例也会把条目丢进回收站，所以这里只比较增量。
  const trashBefore = (await call('GET', '/trash')).json?.count || 0
  const soft = await call('POST', '/delete', { ids: [idA] })
  check('删除改成软删除', soft.json?.removed === 1 && soft.json?.trashed === true, soft.json)
  check('软删除回报保留天数', soft.json?.ttlDays === 30, soft.json?.ttlDays)

  const afterDelete = await call('GET', '/list')
  check('软删除后不在列表里', !(afterDelete.json?.items || []).some((row) => row.id === idA))
  const searched = await call('GET', '/list?q=' + encodeURIComponent('甲的内容'))
  check('软删除后检索不到', !(searched.json?.items || []).some((row) => row.id === idA))
  const onDisk = await stat(join(libRoot, 'files', idA + '.txt')).catch(() => null)
  check('软删除保留磁盘文件', Boolean(onDisk && onDisk.isFile()), onDisk)

  const trash = await call('GET', '/trash')
  check('GET /trash 多出 1 条', trash.json?.count === trashBefore + 1, trash.json?.count)
  check('回收站条目带剩余天数', trash.json?.items?.[0]?.trashDaysLeft === 30, trash.json?.items?.[0]?.trashDaysLeft)

  const restored = await call('POST', '/restore', { ids: [idA] })
  check('还原 1 条', restored.json?.restored?.length === 1, restored.json)
  const afterRestore = await call('GET', '/list')
  check('还原后回到列表', (afterRestore.json?.items || []).some((row) => row.id === idA))

  await call('POST', '/delete', { ids: [idA, idB] })
  const purged = await call('POST', '/purge', { ids: [idB] })
  check('彻底删除 1 条', purged.json?.purged?.length === 1, purged.json)
  const purgedFile = await stat(join(libRoot, 'files', idB + '.txt')).catch(() => null)
  check('彻底删除清掉磁盘文件', purgedFile === null, purgedFile)

  const emptied = await call('POST', '/trash/empty')
  check('清空回收站', emptied.json?.purged === trashBefore + 1, emptied.json?.purged)
  const emptyTrash = await call('GET', '/trash')
  check('清空后回收站为空', emptyTrash.json?.count === 0, emptyTrash.json?.count)
  const emptyPurge = await call('POST', '/purge', { ids: [] })
  check('空选择的 purge → 400', emptyPurge.status === 400 && emptyPurge.json?.error === 'empty-selection', emptyPurge.json)
}

// 15) 访问检查：同源页面照常，外站页面/N 外部 Host 一律 403
{
  // 直接用 http.request，才能自己写 Host / Origin 头（fetch 不让改 Host）。
  const raw = (headers) =>
    new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, path: '/dsh-local-library/stats', method: 'GET', headers }, (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => {
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            json = null
          }
          resolve({ status: response.statusCode, json })
        })
      })
      request.on('error', reject)
      request.end()
    })

  const sameOrigin = await raw({ host: `127.0.0.1:${server.address().port}`, origin: `http://127.0.0.1:${server.address().port}` })
  check('同源请求放行', sameOrigin.status === 200, sameOrigin)

  const evilHost = await raw({ host: 'evil.example.com' })
  check('外部 Host → 403 bad-host', evilHost.status === 403 && evilHost.json?.reason === 'bad-host', evilHost.json)

  const evilOrigin = await raw({ host: `127.0.0.1:${server.address().port}`, origin: 'https://evil.example.com' })
  check('外站 Origin → 403 cross-origin', evilOrigin.status === 403 && evilOrigin.json?.reason === 'cross-origin', evilOrigin.json)

  const wrongPort = await raw({ host: `127.0.0.1:${server.address().port}`, origin: 'http://127.0.0.1:1' })
  check('Origin 端口不符 → 403 cross-origin', wrongPort.status === 403 && wrongPort.json?.reason === 'cross-origin', wrongPort.json)
}

// 16) 有 connection 服务时，以它为准（这里模拟会话缺失 → 401）
{
  const guarded = []
  const guardedCtx = {
    effect: (fn) => {
      const off = fn()
      if (typeof off === 'function') off()
    },
    webServer: { register: (definition) => guarded.push(definition) },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
    get: (name) => (name === 'connection' ? { requestRejection: (req) => (String(req.headers['x-session'] || '') === 'ok' ? undefined : 401) } : undefined)
  }
  const fresh = await import(`../lib/index.js?guard=${Date.now()}`)
  fresh.apply(guardedCtx, {})
  const guardedServer = http.createServer((req, res) => guarded[0].handler(req, res))
  await new Promise((resolve) => guardedServer.listen(0, '127.0.0.1', resolve))
  const port = guardedServer.address().port
  const hit = (headers) =>
    new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, path: '/dsh-local-library/stats', method: 'GET', headers }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject)
      request.end()
    })
  check('connection 拒绝 → 401', (await hit({ host: `127.0.0.1:${port}` })) === 401)
  check('connection 放行 → 200', (await hit({ host: `127.0.0.1:${port}`, 'x-session': 'ok' })) === 200)
  guardedServer.close()
}

server.close()
console.log(`\n${failures.length === 0 ? '全部通过' : `失败 ${failures.length} 项：${failures.join(' / ')}`}`)
process.exit(failures.length === 0 ? 0 : 1)
