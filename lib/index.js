/**
 * dsh-local-library —— 宿主半侧（Cordis 插件）。
 *
 * 三件事：
 *   1. 注册 HTTP 路由 /dsh-local-library/*，给设置页做上传 / 列表 / 下载 / 删除；
 *   2. 注册 4 个工具（library_list / library_search / library_read / library_save），
 *      让任何会话里的 agent 都能直接查这份资料库；
 *   3. 注册一段全局系统提示词，说明"本机有资料库、先查再问"，于是每个新对话天然知道它。
 *
 * 只用 Node 内置模块：profile 的 node_modules 里没有 @deepseek-ai/* 的运行时副本。
 */
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore, MAX_UPLOAD_BYTES, sanitizeName, safeExt, queryWarnings } from './store.js'
import { extractText, guessKind } from './extract.js'
import { pdfTextViaPython } from './pdftext.js'
import { describeImage, normalizeVisionConfig } from './vision.js'
import { writeZip } from './zip.js'
import { collectWorkFiles, listSessions, sessionLabel } from './sessions.js'

export const name = 'local-library'
export const inject = ['webServer', 'tools', 'systemPrompt']

/** 路由前缀（与包名一致，方便在日志里认）。 */
const ROUTE_PREFIX = '/dsh-local-library'
/** 上传响应体上限 = 单文件上限 + 一点余量（按流式写入，内存占用与文件大小无关）。 */
const UPLOAD_LIMIT = MAX_UPLOAD_BYTES + 1024 * 1024
/** 一次打包下载最多多少个文件。 */
const BUNDLE_MAX = 300

/** 内置流抽取对这种 PDF 明显没抽到东西，值得再让 PyMuPDF 试一次。 */
function looksUnusablePdfText(text) {
  const body = String(text || '')
  const trimmed = body.trim()
  if (trimmed.length < 200) return true
  const replacements = (body.match(/\uFFFD/g) || []).length
  if (replacements > 5) return true
  // 控制字符占比高，通常是字体码没映射出来的乱码
  const controls = (body.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length
  return controls > trimmed.length * 0.02
}

function isImageMime(mime) {
  return String(mime || '').toLowerCase().startsWith('image/')
}

function resolveDshHome() {
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim() !== '') return env.trim()
  return join(homedir(), '.dsh')
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(text)
}

/** RFC 5987 的 filename*，中文名下载不乱码。 */
function contentDisposition(name) {
  const ascii = String(name || 'download').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

function readQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost')
  return { url, query: url.searchParams }
}

/** 读小 JSON 请求体（只用于 PATCH / bundle 这类控制请求，限 1MB）。 */
const BODY_LIMIT = 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 读 JSON 请求体并直接处理掉错误响应：返回 undefined 表示"已经回过 4xx/5xx，调用方直接 return"。
 * 多路复用几处 POST/PATCH，省掉每个分支重复的 try/catch。
 */
async function readJsonBody(req, res, fallback) {
  let raw
  try {
    raw = await readBody(req)
  } catch {
    sendJson(res, 413, { error: 'body-too-large' })
    return undefined
  }
  if (!raw || raw.length === 0) {
    if (fallback !== undefined) return fallback
    sendJson(res, 400, { error: 'empty-body' })
    return undefined
  }
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    sendJson(res, 400, { error: 'bad-json' })
    return undefined
  }
}

/**
 * 索引条目 → 给前端 / 工具的公开视图。
 * 索引里存着 sha256（去重用的内部字段）和磁盘布局细节，不该顺着 HTTP 吐出去。
 */
function publicItem(item, folderPath = '') {
  return {
    id: String(item.id || ''),
    name: String(item.name || ''),
    ext: String(item.ext || ''),
    mime: String(item.mime || ''),
    kind: String(item.kind || 'other'),
    size: Number(item.size) || 0,
    textChars: Number(item.textChars) || 0,
    indexed: Boolean(item.indexed),
    createdAt: String(item.createdAt || ''),
    updatedAt: String(item.updatedAt || ''),
    addedBy: String(item.addedBy || ''),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    note: String(item.note || ''),
    // 文件夹 / 备注 / 访问记录：界面靠这几个字段画树、显示"用户写的那句话"。
    folderId: String(item.folderId || ''),
    folderPath: String(folderPath || ''),
    remark: String(item.remark || ''),
    lastAccessAt: String(item.lastAccessAt || ''),
    accessCount: Number(item.accessCount) || 0
  }
}

function publicFolder(folder, path = '') {
  return {
    id: String(folder.id || ''),
    name: String(folder.name || ''),
    parentId: String(folder.parentId || ''),
    path: String(path || ''),
    remark: String(folder.remark || ''),
    createdAt: String(folder.createdAt || ''),
    updatedAt: String(folder.updatedAt || '')
  }
}

/** 工具/提示词里给 agent 看的"位置 + 备注"两行，统一格式免得各处各写一套。 */
function describeLocation(item, store) {
  const path = store.folderPath(item.folderId)
  const where = path ? `${path}/${item.name}` : item.name
  return { where, remark: String(item.remark || '') }
}

export function apply(ctx, config) {
  const root = join(resolveDshHome(), 'local-library')
  const store = new LibraryStore(root)
  const vision = normalizeVisionConfig(config?.vision)
  const initPromise = store.init().catch((error) => {
    console.error('[dsh-local-library] 资料库初始化失败：', error)
    throw error
  })

  /**
   * 后台建索引：先响应上传，抽取慢慢做。
   * PDF 先用内置流抽取；抽不出东西（中文子集字体）时再用 PyMuPDF 兜底；
   * 图片走视觉模型生成一段描述，于是"搜文字"也能搜到截图。
   */
  const indexInBackground = (item) =>
    (async () => {
      const path = store.filePath(item)
      try {
        let result = await extractText({ path, name: item.name, mime: item.mime })
        let note = result.note || ''

        if (result.kind === 'pdf' && looksUnusablePdfText(result.text)) {
          const better = await pdfTextViaPython(path)
          if (better && better.text.trim().length > String(result.text || '').trim().length) {
            result = { text: better.text, kind: 'pdf', note: `PyMuPDF 抽取 ${better.pages} 页` }
            note = result.note
          }
        }

        if (isImageMime(item.mime)) {
          const described = await describeImage(await readFile(path), item.mime, vision)
          if (described?.text) {
            const head = `图片内容描述：${described.text}`
            const merged = result.text.trim() ? `${result.text}\n\n${head}` : head
            result = { text: merged, kind: 'image', note: '' }
            note = ''
          } else if (described?.error) {
            note = `${described.error}（可另配视觉模型；不影响下载）`
          } else if (!vision.enabled) {
            note = '未配置视觉模型描述，只能按文件名检索'
          }
        }

        await store.applyExtraction(item.id, { text: result.text, kind: result.kind, note })
      } catch (error) {
        await store
          .applyExtraction(item.id, { text: '', kind: item.kind, note: `extract-failed: ${String(error?.message || error)}` })
          .catch(() => {})
      }
    })()

  /**
   * 抽取任务队列：一次上传/重建索引可能排几十上百个文件，
   * 而每个抽取都会把整份文件读进内存，所以限制同时只跑 2 个。
   * 同一个条目重复入队只保留一次（连点两次"重建索引"不会跑两遍）。
   */
  const indexQueue = []
  const indexPending = new Set()
  let indexRunning = 0
  const INDEX_CONCURRENCY = 2
  const pumpIndexQueue = () => {
    while (indexRunning < INDEX_CONCURRENCY && indexQueue.length > 0) {
      const item = indexQueue.shift()
      indexRunning += 1
      indexInBackground(item)
        .catch(() => {})
        .finally(() => {
          indexRunning -= 1
          indexPending.delete(item.id)
          pumpIndexQueue()
        })
    }
  }
  const queueIndex = (item) => {
    if (!item || !item.id || indexPending.has(item.id)) return
    indexPending.add(item.id)
    indexQueue.push(item)
    pumpIndexQueue()
  }

  // ── HTTP 路由 ────────────────────────────────────────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
          try {
            await initPromise
          } catch {
            sendJson(res, 500, { error: 'store-init-failed' })
            return
          }
          const { url, query } = readQuery(req)
          const route = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')
          const method = (req.method || 'GET').toUpperCase()

          try {
            if (route === 'list' && method === 'GET') {
              const q = query.get('q') || ''
              const limit = Math.max(1, Math.min(Number(query.get('limit')) || 200, 1000))
              // 不带关键词时也要按 limit 截断，并且只吐出前端需要的字段：
              // 索引里的 sha256 是内部去重用的，没必要（也不应该）发给页面。
              const view = (item) => publicItem(item, store.folderPath(item.folderId))
              const items = q
                ? (await store.search(q, limit)).map((hit) => ({
                    ...view(hit.item),
                    score: hit.score,
                    snippet: hit.snippet,
                    matchedBy: hit.matchedBy || ''
                  }))
                : store.items().slice(0, limit).map(view)
              const stats = await store.stats()
              // 文件夹一次全给：面板要画整棵树，单独再来一个请求反而更慢。
              const folders = store.folders().map((folder) => publicFolder(folder, store.folderPath(folder.id)))
              sendJson(res, 200, { items, folders, stats, pending: store.pending(), warnings: q ? queryWarnings(q) : [] })
              return
            }

            if (route === 'stats' && method === 'GET') {
              sendJson(res, 200, await store.stats())
              return
            }

            // 设置页的「严格匹配」开关：loose（默认，宽松） / strict（要求关键词命中率高）。
            if (route === 'config' && method === 'GET') {
              sendJson(res, 200, await store.getSettings())
              return
            }

            if (route === 'config' && (method === 'PUT' || method === 'POST')) {
              const raw = await readBody(req)
              let parsed
              try {
                parsed = JSON.parse(raw.toString('utf8') || '{}')
              } catch {
                sendJson(res, 400, { error: 'invalid-json' })
                return
              }
              const mode = parsed?.matchMode
              if (mode !== undefined && mode !== 'loose' && mode !== 'strict') {
                sendJson(res, 400, { error: 'invalid-match-mode', allowed: ['loose', 'strict'] })
                return
              }
              sendJson(res, 200, await store.updateSettings(mode === undefined ? {} : { matchMode: mode }))
              return
            }

            if (route === 'upload' && method === 'POST') {
              const declared = Number(req.headers['content-length']) || 0
              if (declared > UPLOAD_LIMIT) {
                sendJson(res, 413, { error: 'too-large', limit: MAX_UPLOAD_BYTES })
                return
              }
              // query.get() 拿到的已经是解码后的值，这里不能再 decodeURIComponent：
              // 文件名里带 % 的文件（"完成度 100%.md"）会被二次解码抛 URIError，上传直接 500。
              const rawName = query.get('name') || '未命名'
              const fileName = sanitizeName(rawName)
              const kind = guessKind(fileName, req.headers['content-type'] || '')
              const asked = String(query.get('dup') || 'reject').toLowerCase()
              const duplicatePolicy = ['keep', 'replace', 'reject'].includes(asked) ? asked : 'reject'
              const tags = String(query.get('tags') || '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
              // 拖整个文件夹进来时前端会带相对路径（"论文/2026/a.pdf"）：逐级建目录再落文件，
              // 于是库里的层次和用户磁盘上的层次一致。
              let folderId = String(query.get('folder') || '').trim()
              if (folderId && !store.getFolder(folderId)) folderId = ''
              const relPath = String(query.get('path') || query.get('relpath') || '').trim().replace(/\\/g, '/')
              const parentPath = relPath.split('/').filter(Boolean).slice(0, -1).join('/')
              if (parentPath) {
                // 相对路径挂在目标文件夹下面（拖进"论文"里的整个目录，树就长在"论文"里）。
                const chain = await store.ensureFolderPath(parentPath, folderId)
                if (chain) folderId = chain
              }
              const remark = String(query.get('remark') || '')
              const { item, duplicate } = await store.addFile({
                name: fileName,
                stream: req,
                kind,
                addedBy: 'upload',
                tags,
                folderId,
                remark,
                duplicatePolicy
              })
              if (!item) {
                // 内容完全一样：把已有条目告诉界面，让它问用户"覆盖 / 再存一份 / 跳过"。
                sendJson(res, 409, {
                  error: 'duplicate',
                  duplicate: duplicate
                    ? {
                        id: duplicate.id,
                        name: duplicate.name,
                        size: Number(duplicate.size) || 0,
                        createdAt: duplicate.createdAt
                      }
                    : null
                })
                return
              }
              queueIndex(item)
              sendJson(res, 200, { item: publicItem(item, store.folderPath(item.folderId)), replaced: duplicate ? duplicate.id : '' })
              return
            }

            if (route === 'item' && method === 'PATCH') {
              const id = query.get('id') || ''
              const raw = await readBody(req)
              let patch = {}
              try {
                patch = raw ? JSON.parse(raw.toString('utf8')) : {}
              } catch {
                sendJson(res, 400, { error: 'bad-json' })
                return
              }
              const item = await store.updateMeta(id, {
                name: patch?.name,
                tags: patch?.tags,
                remark: patch?.remark,
                folderId: patch?.folderId
              })
              if (!item) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              sendJson(res, 200, { item: publicItem(item, store.folderPath(item.folderId)) })
              return
            }

            if (route === 'bundle' && method === 'POST') {
              const raw = await readBody(req)
              let ids = []
              try {
                const parsed = raw ? JSON.parse(raw.toString('utf8')) : {}
                ids = Array.isArray(parsed?.ids) ? parsed.ids.map(String) : []
              } catch {
                sendJson(res, 400, { error: 'bad-json' })
                return
              }
              if (ids.length === 0) {
                sendJson(res, 400, { error: 'empty-selection' })
                return
              }
              // 0 字节的文件也要能进 zip（listForBundle 里已经 stat 过，存在的文件就收）。
              const files = await store.listForBundle(ids.slice(0, BUNDLE_MAX))
              if (files.length === 0) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              const stamp = new Date().toISOString().slice(0, 10)
              res.writeHead(200, {
                'content-type': 'application/zip',
                'content-disposition': contentDisposition(`本地资料库-${stamp}.zip`),
                'cache-control': 'no-store'
              })
              const written = await writeZip(res, files)
              res.end()
              if (written.count === 0) console.warn('[dsh-local-library] 打包内容为空')
              return
            }

            if (route === 'download' && method === 'GET') {
              const id = query.get('id') || ''
              const resolved = await store.resolveFile(id)
              if (!resolved) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              res.writeHead(200, {
                'content-type': resolved.item.mime || 'application/octet-stream',
                'content-length': resolved.size,
                'content-disposition': contentDisposition(resolved.item.name),
                'cache-control': 'no-store'
              })
              const stream = createReadStream(resolved.path)
              stream.on('error', () => res.destroy())
              stream.pipe(res)
              return
            }

            if (route === 'item' && method === 'DELETE') {
              const id = query.get('id') || ''
              const removed = await store.remove(id)
              if (!removed) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              sendJson(res, 200, { removed: removed.id })
              return
            }

            if (route === 'reindex' && method === 'POST') {
              const force = ['1', 'true', 'yes'].includes(String(query.get('all') || '').toLowerCase())
              const targets = force ? store.items() : store.items().filter((item) => !item.indexed)
              for (const item of targets) queueIndex(item)
              sendJson(res, 200, { queued: targets.length, forced: force })
              return
            }

            // ── 文件夹（像资源管理器那样建/改名/备注/删/挪）─────────────────────
            if (route === 'tree' && method === 'GET') {
              const folderList = store.folders()
              const folders = folderList.map((folder) => publicFolder(folder, store.folderPath(folder.id)))
              const items = store.items().map((item) => publicItem(item, store.folderPath(item.folderId)))
              sendJson(res, 200, { folders, items, stats: await store.stats(), pending: store.pending() })
              return
            }

            if (route === 'folder' && method === 'POST') {
              const parsed = await readJsonBody(req, res)
              if (parsed === undefined) return
              const folder = await store.addFolder({
                name: parsed?.name,
                parentId: parsed?.parentId ?? parsed?.folderId,
                remark: parsed?.remark
              })
              if (!folder) {
                sendJson(res, 400, { error: 'invalid-folder' })
                return
              }
              sendJson(res, 200, { folder: publicFolder(folder, store.folderPath(folder.id)) })
              return
            }

            if (route === 'folder' && (method === 'PATCH' || method === 'PUT')) {
              const parsed = await readJsonBody(req, res)
              if (parsed === undefined) return
              const folder = await store.updateFolder(query.get('id') || parsed?.id || '', {
                name: parsed?.name,
                remark: parsed?.remark,
                parentId: parsed?.parentId
              })
              if (!folder) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              sendJson(res, 200, { folder: publicFolder(folder, store.folderPath(folder.id)) })
              return
            }

            if (route === 'folder' && method === 'DELETE') {
              const recursive = ['1', 'true', 'yes'].includes(String(query.get('recursive') || '').toLowerCase())
              const removed = await store.removeFolder(query.get('id') || '', { recursive })
              if (!removed) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              sendJson(res, 200, removed)
              return
            }

            if (route === 'move' && method === 'POST') {
              const parsed = await readJsonBody(req, res)
              if (parsed === undefined) return
              const ids = Array.isArray(parsed?.ids) ? parsed.ids.map(String) : []
              const moved = await store.moveItems(ids, String(parsed?.folderId || ''))
              sendJson(res, 200, { moved })
              return
            }

            // ── 最近访问 ────────────────────────────────────────────────────────
            if (route === 'recent' && method === 'GET') {
              const limit = Math.max(1, Math.min(Number(query.get('limit')) || 40, 300))
              const items = (await store.recent(limit)).map((item) =>
                publicItem(item, store.folderPath(item.folderId))
              )
              sendJson(res, 200, { items })
              return
            }

            if (route === 'touch' && method === 'POST') {
              const item = await store.touchAccess(query.get('id') || '')
              if (!item) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              sendJson(res, 200, { item: publicItem(item, store.folderPath(item.folderId)) })
              return
            }

            // ── 本地工作生成文件（读会话日志，只读）─────────────────────────────
            if (route === 'workfiles' && method === 'GET') {
              const limit = Math.max(1, Math.min(Number(query.get('limit')) || 80, 500))
              const files = await collectWorkFiles(resolveDshHome(), { limit })
              const sessions = await listSessions(resolveDshHome())
              sendJson(res, 200, {
                files,
                sessions: sessions.slice(0, 40).map((session) => ({
                  id: session.id,
                  title: session.title,
                  label: sessionLabel(session),
                  cwd: session.cwd,
                  createdAt: session.createdAt,
                  updatedAt: session.updatedAt,
                  deliverables: session.deliverables.reduce((sum, row) => sum + row.files.length, 0)
                }))
              })
              return
            }

            // 面板里的卡片预览：只读索引时抽好的纯文本，不重新解析原文件。
            if (route === 'preview' && method === 'GET') {
              const id = query.get('id') || ''
              const item = store.get(id)
              if (!item) {
                sendJson(res, 404, { error: 'not-found' })
                return
              }
              const offset = Math.max(0, Number(query.get('offset')) || 0)
              const maxChars = Math.max(200, Math.min(Number(query.get('maxChars')) || 6000, 40000))
              const body = await store.readText(id, maxChars, offset)
              await store.touchAccess(id)
              sendJson(res, 200, {
                item: publicItem(item, store.folderPath(item.folderId)),
                text: body?.text || '',
                offset: body?.offset || 0,
                total: body?.total || 0,
                hasText: Boolean(body && body.total > 0)
              })
              return
            }

            // 把磁盘上已有的文件收进库（"工作生成文件 → 存入资料库"按钮用）。
            if (route === 'import-path' && method === 'POST') {
              const parsed = await readJsonBody(req, res)
              if (parsed === undefined) return
              const source = String(parsed?.path || '').trim()
              if (!source) {
                sendJson(res, 400, { error: 'missing-path' })
                return
              }
              const result = await store.importPath(source, {
                folderId: String(parsed?.folderId || ''),
                remark: String(parsed?.remark || ''),
                addedBy: 'agent'
              })
              if (!result.item) {
                sendJson(res, 400, { error: result.error || 'import-failed', duplicate: result.duplicate?.id || '' })
                return
              }
              queueIndex(result.item)
              sendJson(res, 200, { item: publicItem(result.item, store.folderPath(result.item.folderId)) })
              return
            }

            sendJson(res, 404, { error: 'no-route', route, method })
          } catch (error) {
            console.error('[dsh-local-library] 路由异常：', error)
            if (!res.headersSent) sendJson(res, 500, { error: String(error?.message || error) })
            else res.destroy()
          }
        }
      }),
    'dsh-local-library: routes'
  )

  // ── 工具 ────────────────────────────────────────────────────────────────
  // 给 agent 看的一行；用户写的"位置"和"备注"另起一行 —— 这两样是他自己帮未来自己
  // 留的线索（"这是导师那版""投稿用的"），比文件名更能说明这文件是什么。
  const itemLine = (item, layout) => {
    const bits = [item.name, `[${item.kind}]`, `${(Number(item.size) || 0).toString()}B`]
    if (item.indexed && item.textChars > 0) bits.push(`正文${item.textChars}字`)
    else if (!item.indexed) bits.push('索引中')
    else bits.push('无正文')
    if (item.addedBy === 'agent') bits.push('agent 存入')
    bits.push(item.createdAt)
    const head = `${item.id}  ${bits.join('  ')}`
    const extra = []
    const where = layout ? layout.folderPath(item.folderId) : ''
    if (where) extra.push(`位置：${where}`)
    const remark = String(item.remark || '').trim()
    if (remark) extra.push(`备注：${remark}`)
    return extra.length > 0 ? `${head}\n    ${extra.join('    ')}` : head
  }

  // 工具结果里"这文件在库里的哪儿、用户自己写了什么"的固定三行。
  const locationLine = (value) => {
    const lines = []
    if (value.folderPath) lines.push(`位置：${value.folderPath}`)
    if (value.remark) lines.push(`备注：${value.remark}`)
    lines.push(`路径：${value.path}`)
    return lines.join('\n')
  }

  const withPaths = (store, item) => ({ ...item, path: store.filePath(item) })

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'library_list',
        description:
          '列出本机「本地资料库」里的全部资料（用户自己上传的、跨会话共享的文件）。想确认库里有没有相关材料时先调它；也可以用关键词调 library_search。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '最多返回多少条，默认 50' }
          },
          additionalProperties: false
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              count: { type: 'number' },
              bytesText: { type: 'string' },
              root: { type: 'string' },
              empty: { type: 'boolean' },
              folders: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    path: { type: 'string' },
                    remark: { type: 'string' }
                  }
                }
              },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    kind: { type: 'string' },
                    size: { type: 'number' },
                    textChars: { type: 'number' },
                    indexed: { type: 'boolean' },
                    createdAt: { type: 'string' },
                    folderPath: { type: 'string' },
                    remark: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    path: { type: 'string' }
                  }
                }
              }
            }
          },
          render: (_args, value) => {
            const head =
              value.count === 0
                ? `本地资料库是空的（目录 ${value.root}）。可以让用户在侧边栏「本地资料库」或 设置 → 本地资料库 里上传文件。`
                : `本地资料库共 ${value.count} 个文件（${value.bytesText}），目录 ${value.root}：`
            const body = (value.items || [])
              .map((item) =>
                itemLine({ ...item, tags: item.tags || [] }, { folderPath: () => item.folderPath || '' })
              )
              .join('\n')
            const folderLines = (value.folders || []).map((folder) =>
              folder.remark ? `  ${folder.path}/    // ${folder.remark}` : `  ${folder.path}/`
            )
            const parts = [head]
            if (body) parts.push(body)
            if (folderLines.length > 0) {
              parts.push(
                `文件夹（${folderLines.length} 个，路径后面 // 开头的部分是用户写的备注）：\n${folderLines.join('\n')}`
              )
            }
            return [{ type: 'text', text: parts.join('\n\n') }]
          }
        },
        async execute(args) {
          await initPromise
          const limit = Math.max(1, Math.min(Number(args?.limit) || 50, 500))
          const raw = store.items().slice(0, limit)
          const items = raw.map((item) => withPaths(store, item))
          const stats = await store.stats()
          return {
            count: store.items().length,
            bytesText: stats.bytesText,
            root: root,
            empty: store.items().length === 0,
            folders: store.folders().map((folder) => ({
              id: folder.id,
              name: folder.name,
              path: store.folderPath(folder.id),
              remark: String(folder.remark || '')
            })),
            items: items.map((item) => ({
              id: item.id,
              name: item.name,
              kind: item.kind,
              size: Number(item.size) || 0,
              textChars: Number(item.textChars) || 0,
              indexed: Boolean(item.indexed),
              createdAt: item.createdAt,
              folderPath: store.folderPath(item.folderId),
              remark: String(item.remark || ''),
              tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
              path: item.path
            }))
          }
        }
      }),
    'dsh-local-library: library_list'
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'library_search',
        description:
          '在本机「本地资料库」里按关键词检索文件名与正文（PDF/Word/Excel/PPT 已抽取成纯文本，图片若配了视觉模型则按其内容描述检索）。用户提到"我之前给你的那份资料""我的文档里有没有…"这类说法时，先检索这里，不要要求用户重新上传。中文按两字组合匹配，所以"预算表里的差旅费"也能搜到含"差旅费"的文档。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '关键词，多个用空格分隔；留空则按上传时间倒序返回最近的资料' },
            kind: {
              type: 'string',
              description: '只看某类：pdf / docx / xlsx / pptx / text / image 等（也接受 .pdf 这种扩展名）'
            },
            tag: { type: 'string', description: '只看带某个标签的资料' },
            limit: { type: 'number', description: '最多返回几条，默认 8' },
            strict: {
              type: 'boolean',
              description: '严格匹配：只返回关键词命中率高（或整句原样出现）的结果，减少擦边命中。不传则用资料库设置里的开关'
            }
          },
          required: ['query'],
          additionalProperties: false
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              query: { type: 'string' },
              hits: { type: 'number' },
              total: { type: 'number' },
              warnings: {
                type: 'array',
                description: '查询里被忽略的过滤条件（例如日期写错），需要转告用户',
                items: { type: 'string' }
              },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    kind: { type: 'string' },
                    size: { type: 'number' },
                    textChars: { type: 'number' },
                    score: { type: 'number' },
                    snippet: { type: 'string' },
                    matchedBy: { type: 'string' },
                    folderPath: { type: 'string' },
                    remark: { type: 'string' },
                    path: { type: 'string' }
                  }
                }
              }
            }
          },
          render: (_args, value) => {
            const warn = (value.warnings || []).length > 0 ? `⚠ ${value.warnings.join('；')}\n` : ''
            const body =
              value.hits === 0
                ? `本地资料库里没有命中「${value.query}」的资料（库里共 ${value.total} 个文件）。可以换关键词，或用 library_list 看全貌。`
                : `命中 ${value.hits} 条（库内共 ${value.total} 个文件）：\n${value.results
                    .map((hit) => {
                      const lines = [
                        `· ${hit.id}  ${hit.name}  [${hit.kind}]  ${hit.size}B${hit.textChars ? `  正文${hit.textChars}字` : ''}`,
                        `  路径：${hit.path}`
                      ]
                      if (hit.folderPath) lines.push(`  位置：${hit.folderPath}`)
                      if (hit.remark) lines.push(`  备注：${hit.remark}`)
                      if (hit.snippet) lines.push(`  片段：${hit.snippet}`)
                      else if (hit.matchedBy === 'name') lines.push('  命中：按文件名/标签/备注（正文里没有这个词）')
                      return lines.join('\n')
                    })
                    .join('\n')}`
            return [{ type: 'text', text: warn + body }]
          }
        },
        async execute(args) {
          await initPromise
          const query = String(args?.query || '').trim()
          const kind = String(args?.kind || '').trim()
          const tag = String(args?.tag || '').trim()
          const composed = [query, kind ? `kind:${kind.replace(/^\./, '')}` : '', tag ? `tag:${tag}` : '']
            .filter(Boolean)
            .join(' ')
          const strict = typeof args?.strict === 'boolean' ? args.strict : undefined
          const hits = await store.search(composed, Number(args?.limit) || 8, strict === undefined ? {} : { strict })
          return {
            query: composed,
            hits: hits.length,
            total: store.items().length,
            warnings: queryWarnings(composed),
            results: hits.map((hit) => ({
              id: hit.item.id,
              name: hit.item.name,
              kind: hit.item.kind,
              size: Number(hit.item.size) || 0,
              textChars: Number(hit.item.textChars) || 0,
              score: hit.score,
              snippet: hit.snippet,
              matchedBy: hit.matchedBy || '',
              folderPath: store.folderPath(hit.item.folderId),
              remark: String(hit.item.remark || ''),
              path: store.filePath(hit.item)
            }))
          }
        }
      }),
    'dsh-local-library: library_search'
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'library_read',
        description:
          '读取「本地资料库」里某个文件的正文（PDF/Word/Excel/PPT 抽取后的纯文本）。用 library_search / library_list 拿到 id 后再调它。二进制文件（图片等）没有正文，会返回磁盘路径，可再用读图工具打开该路径。',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '条目 id（ll-…）。也可以改用 name 精确匹配。' },
            name: { type: 'string', description: '文件名（精确匹配，二选一）' },
            maxChars: { type: 'number', description: '本次最多返回多少字符，默认 20000' },
            offset: { type: 'number', description: '从第几个字符开始读，默认 0。返回里会给 nextOffset，长文档可接着读下一段。' }
          },
          additionalProperties: false
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              found: { type: 'boolean' },
              id: { type: 'string' },
              name: { type: 'string' },
              kind: { type: 'string' },
              path: { type: 'string' },
              folderPath: { type: 'string' },
              remark: { type: 'string' },
              text: { type: 'string' },
              total: { type: 'number' },
              offset: { type: 'number' },
              nextOffset: { type: 'number' },
              remaining: { type: 'number' },
              truncated: { type: 'boolean' },
              note: { type: 'string' }
            }
          },
          render: (_args, value) => {
            if (!value.found) return [{ type: 'text', text: '本地资料库里没有这个文件；先用 library_list 或 library_search 确认 id。' }]
            if (!value.text) {
              // 有正文但这次一个字都没读到，说明 offset 已经越过末尾，别说成"没有可读正文"。
              if (value.total > 0) {
                return [
                  {
                    type: 'text',
                    text: `${value.name} 已经读到末尾了（全文 ${value.total} 字符）。要看开头请把 offset 设成 0，或换一个更小的 offset。`
                  }
                ]
              }
              return [
                {
                  type: 'text',
                  text: `${value.name}（${value.kind}，${value.path}）没有可读正文${value.note ? `：${value.note}` : ''}。图片等二进制文件可以直接打开上面的路径。`
                }
              ]
            }
            // 注意：readText 可能已经给正文尾巴拼了续读提示，value.text.length 会偏大，
            // 这里用 nextOffset 反推真正读到的位置。
            const endPos = value.nextOffset > 0 ? value.nextOffset : value.offset + value.text.length
            const range =
              value.offset > 0 || value.remaining > 0
                ? `\n\n（第 ${value.offset + 1}–${endPos} 字 / 全文 ${value.total} 字符${value.remaining > 0 ? `，还有 ${value.remaining} 字未读：再调一次 library_read 并设 offset=${value.nextOffset}` : '，已到末尾'}）`
                : ''
            return [{ type: 'text', text: `# ${value.name}（${value.kind}）\n${locationLine(value)}${range}\n\n${value.text}` }]
          }
        },
        async execute(args) {
          await initPromise
          const id = String(args?.id || '').trim()
          const wantedName = String(args?.name || '').trim()
          const item = id ? store.get(id) : wantedName ? store.items().find((it) => it.name === wantedName) : undefined
          if (!item) {
            return {
              found: false,
              id,
              name: wantedName,
              kind: '',
              path: '',
              text: '',
              total: 0,
              offset: 0,
              nextOffset: 0,
              remaining: 0,
              truncated: false,
              note: 'not-found'
            }
          }
          const read = await store.readText(item.id, Number(args?.maxChars) || 20000, Number(args?.offset) || 0)
          // 读过就算访问过 —— 面板的「最近访问」靠这个排序，这也是用户唯一会看的"我最近翻了什么"。
          await store.touchAccess(item.id).catch(() => {})
          return {
            found: true,
            id: item.id,
            name: item.name,
            kind: item.kind,
            path: store.filePath(item),
            folderPath: store.folderPath(item.folderId),
            remark: String(item.remark || ''),
            text: read?.text || '',
            total: read?.total || 0,
            offset: read?.offset || 0,
            nextOffset: read?.nextOffset || 0,
            remaining: read?.remaining || 0,
            truncated: Boolean(read?.truncated),
            note: item.note || ''
          }
        }
      }),
    'dsh-local-library: library_read'
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'library_save',
        description:
          '把一段文本（整理好的结论、笔记、抓下来的网页正文、报告草稿）存进「本地资料库」，之后任何会话都能检索到。文件名请带上扩展名，例如 2026-10-30-SDK调研.md。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '文件名（含扩展名，如 xxx.md）' },
            content: { type: 'string', description: '正文内容' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '可选标签，便于检索'
            },
            folder: {
              type: 'string',
              description: '可选：存到哪个文件夹，写路径即可（如 "论文/投稿"），不存在会自动逐级创建；不传则存到库根目录'
            },
            remark: {
              type: 'string',
              description: '可选：一句话备注，说明这份东西是什么、给谁用、结论是什么。用户会在面板里看到它，之后的会话也会读到'
            }
          },
          required: ['name', 'content'],
          additionalProperties: false
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              saved: { type: 'boolean' },
              id: { type: 'string' },
              name: { type: 'string' },
              path: { type: 'string' },
              folderPath: { type: 'string' },
              textChars: { type: 'number' }
            }
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: value.saved
                ? `已存入本地资料库：${value.name}（${value.textChars} 字）\n${locationLine(value)}`
                : '没有存成功：文件名或正文为空。'
            }
          ]
        },
        async execute(args) {
          await initPromise
          // 注意：sanitizeName('') 会返回「未命名」，所以必须先判原始文件名，
          // 否则传一个空名字会静默存成「未命名」而不是返回 saved:false。
          const rawName = String(args?.name ?? '').trim()
          const fileName = rawName ? sanitizeName(rawName) : ''
          const content = String(args?.content ?? '')
          if (!rawName || content.trim() === '') {
            return { saved: false, id: '', name: fileName, path: '', folderPath: '', textChars: 0 }
          }
          const folderPath = String(args?.folder || '').trim()
          const folderId = folderPath ? await store.ensureFolderPath(folderPath) : ''
          const { item } = await store.addFile({
            name: fileName,
            buffer: Buffer.from(content, 'utf8'),
            kind: guessKind(fileName, 'text/plain'),
            addedBy: 'agent',
            tags: Array.isArray(args?.tags) ? args.tags : [],
            folderId,
            remark: String(args?.remark || '')
          })
          if (!item) return { saved: false, id: '', name: fileName, path: '', folderPath: '', textChars: 0 }
          await store.applyExtraction(item.id, { text: content, kind: 'text', note: '' })
          return {
            saved: true,
            id: item.id,
            name: item.name,
            path: store.filePath(item),
            folderPath: store.folderPath(item.folderId),
            textChars: content.length
          }
        }
      }),
    'dsh-local-library: library_save'
  )

  // ── 系统提示词：让每个新会话都知道资料库的存在 ────────────────────────
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'tool:local-library',
        order: 950,
        text: [
          '## 本地资料库',
          '',
          '本机有一份由用户维护的「本地资料库」，跨会话共享，磁盘目录会随工具结果给出。当任务可能涉及用户已有的材料——论文、公司文档、报表、笔记、截图、聊天导出——先用 library_search（关键词）或 library_list（全貌）查一遍，不要一上来就要求用户重新上传文件。',
          '',
          '- library_list：列出库里有什么（id / 名称 / 类型 / 大小 / 上传时间 / 所在文件夹 / 备注 / 磁盘路径）。',
          '- library_search：按关键词检索文件名、备注、文件夹路径与正文（PDF、Word、Excel、PPT 已抽取为纯文本；图片在配了视觉模型时按其内容描述检索）。中文按两字组合匹配，长句也能命中。可用 kind= / tag= 过滤。',
          '- library_read：读某条目的正文，支持 offset 分段读长文档；图片等二进制文件会返回磁盘路径，可直接用读图工具打开那个路径。',
          '- library_save：把这次整理的结论或抓下来的长文存回库里，供以后的会话复用；可以指定 folder（如 "论文/投稿"，自动建目录）和一句 remark。',
          '',
          '用户会对文件和文件夹改名、写备注、用文件夹分类。**备注（remark）是他自己写的"这东西是什么"，权重和文件名一样高**：检索结果里的「备注：」和「位置：」要当真读——它常常直接说明了用途、版本或结论（"这是导师改过的版本""客户只认这版数字"），比正文摘要更能决定该不该用这份材料。',
          '用户提到某个文件夹（"论文那个文件夹里"）时，用 library_list 看整棵树，或直接对文件夹名做 library_search。',
          '',
          '检索结果太杂（擦边命中多）时，给 library_search 加 strict: true 走严格匹配；用户也可以在 设置 → 本地资料库 里把「严格匹配」默认打开。',
          '',
          '用户说"我之前给你的那份资料""看下我的文档""根据我的笔记"时，指的就是这里。反过来，当用户的请求会用到他们自己的材料（写周报、做方案、引用数据、沿用上次的结论），而你还不确定库里有没有相关文件时，先 library_list 看一眼——一次调用成本很低，比让用户重新上传、或者凭猜测作答要好。'
        ].join('\n'),
        interpolate: false
      }),
    'dsh-local-library: prompt section'
  )
}
