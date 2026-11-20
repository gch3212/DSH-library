/**
 * 会话日志只读扫描器 —— 「本地工作生成文件」那一栏的数据源。
 *
 * DSH 把每个会话追加写进
 *   <DSH_HOME>/sessions/<编码后的 cwd>/session-<uuid>/session.v4.jsonl.zstd
 * 文件是一串独立的 zstd frame（每次 flush 一个 frame），frame 里是标准的 JSONL 事件。
 * 这里只读、不写、不加锁：日志正被宿主追加时最多读到半个 frame，解不开就跳过，
 * 下一次刷新自然会补上。
 *
 * 只关心三类事件：
 *   session             —— 会话头（id / cwd / createdAt）
 *   session/title       —— 会话标题
 *   deliverables/presented —— agent 明确交付给用户的文件（带一句说明）
 *   tool/call           —— 少数直接写文件的工具（write / edit 这类，PTC 模式下一般走 run_code）
 *
 * 解析结果按 (mtimeMs, size) 缓存：2 MB 的日志逐帧解压大约 1 秒，
 * 不缓存的话每次打开面板都要等它。
 */

import { readFile, stat } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
/** 单个日志文件最多读这么大；再大的会话（超长对话）只读前面这些，够拿交付物了。 */
const MAX_LOG_BYTES = 96 * 1024 * 1024
/** 一个 work file 列表最多回溯多少个会话。 */
const MAX_SESSIONS = 200
/** 直接写文件的工具名（宿主侧 tools 名，PTC 之外才会出现）。 */
const WRITER_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'ops_write_file', 'create_file'])

/** path -> { mtimeMs, size, parsed } */
const cache = new Map()

function frameOffsets(buffer) {
  const offsets = []
  let from = 0
  for (;;) {
    const at = buffer.indexOf(FRAME_MAGIC, from)
    if (at < 0) break
    offsets.push(at)
    from = at + FRAME_MAGIC.length
  }
  return offsets
}

/** 读一个会话日志，按事件类型抽出需要的东西。失败一律返回 null，不让界面因此炸掉。 */
async function readSessionLog(file) {
  let info
  try {
    info = await stat(file)
  } catch {
    return null
  }
  if (info.size <= 0 || info.size > MAX_LOG_BYTES) return null
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.parsed

  let buffer
  try {
    buffer = await readFile(file)
  } catch {
    return null
  }

  const parsed = {
    id: '',
    cwd: '',
    createdAt: 0,
    updatedAt: 0,
    title: '',
    events: 0,
    deliverables: [],
    writes: []
  }
  for (const offset of frameOffsets(buffer)) {
    let text
    try {
      text = zstdDecompressSync(buffer.subarray(offset)).toString('utf8')
    } catch {
      // 宿主正在追加（末尾半个 frame）或这一处只是字节巧合，跳过即可。
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (!record || typeof record !== 'object') continue
      parsed.events += 1
      const time = Number(record.time) || 0
      if (time > parsed.updatedAt) parsed.updatedAt = time
      const data = record.data && typeof record.data === 'object' ? record.data : {}
      switch (record.type) {
        case 'session': {
          if (typeof record.id === 'string') parsed.id = record.id
          if (typeof record.cwd === 'string') parsed.cwd = record.cwd
          if (Number(record.createdAt) > 0) parsed.createdAt = Number(record.createdAt)
          break
        }
        case 'session/title': {
          if (typeof data.title === 'string' && data.title.trim()) parsed.title = data.title.trim()
          break
        }
        case 'deliverables/presented': {
          const files = Array.isArray(data.files) ? data.files : []
          const items = []
          for (const file of files) {
            if (!file || typeof file.path !== 'string' || !file.path.trim()) continue
            items.push({
              path: file.path.trim(),
              description: typeof file.description === 'string' ? file.description : ''
            })
          }
          if (items.length > 0) {
            parsed.deliverables.push({ turn: Number(data.turn) || 0, at: time, files: items })
          }
          break
        }
        case 'tool/call': {
          const name = String(data.name || '')
          if (!WRITER_TOOLS.has(name)) break
          const args = parseArgs(data.arguments)
          const path = argsFilePath(args)
          if (!path) break
          parsed.writes.push({ path, turn: Number(data.turn) || 0, at: time, tool: name })
          break
        }
        default:
          break
      }
    }
  }

  if (!parsed.id) {
    const match = /(session-[0-9a-f-]+)/i.exec(file)
    parsed.id = match ? match[1] : ''
  }
  if (!parsed.createdAt) parsed.createdAt = Math.round(info.birthtimeMs || info.mtimeMs || 0)
  if (!parsed.updatedAt) parsed.updatedAt = Math.round(info.mtimeMs || 0)

  cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, parsed })
  return parsed
}

function parseArgs(raw) {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function argsFilePath(args) {
  if (!args || typeof args !== 'object') return ''
  for (const key of ['path', 'file_path', 'filePath', 'target']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** 列出所有会话目录里的日志文件（不含子目录）。 */
async function logFiles(dshHome) {
  const root = join(dshHome, 'sessions')
  let groups
  try {
    groups = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const group of groups) {
    if (!group.isDirectory()) continue
    let sessions
    try {
      sessions = await readdir(join(root, group.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = join(root, group.name, session.name, 'session.v4.jsonl.zstd')
      files.push(file)
    }
  }
  return files
}

/**
 * 扫一遍全部会话日志，返回按最近活动排序的会话摘要（不含正文，只有标题/目录/交付物）。
 */
export async function listSessions(dshHome) {
  const files = await logFiles(dshHome)
  const sessions = []
  for (const file of files) {
    const parsed = await readSessionLog(file)
    if (!parsed || !parsed.id) continue
    sessions.push(parsed)
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return sessions.slice(0, MAX_SESSIONS)
}

/**
 * 「工作生成文件」：把各会话的交付物与写文件动作摊平成文件列表。
 * 同一个路径只留最近一次（agent 经常一个文件改好几轮），并补上磁盘上的存在状态。
 */
export async function collectWorkFiles(dshHome, { limit = 120 } = {}) {
  const sessions = await listSessions(dshHome)
  const byPath = new Map()
  for (const session of sessions) {
    const base = {
      sessionId: session.id,
      sessionTitle: session.title,
      cwd: session.cwd
    }
    for (const entry of session.deliverables) {
      for (const file of entry.files) {
        const at = entry.at || session.updatedAt
        const previous = byPath.get(file.path)
        if (previous && previous.at >= at && previous.kind === 'deliverable') continue
        byPath.set(file.path, {
          ...base,
          path: file.path,
          name: baseName(file.path),
          description: file.description,
          kind: 'deliverable',
          turn: entry.turn,
          at
        })
      }
    }
    for (const write of session.writes) {
      const at = write.at || session.updatedAt
      const previous = byPath.get(write.path)
      if (previous) continue // 已交付的更值得看，不拿普通写覆盖它
      byPath.set(write.path, {
        ...base,
        path: write.path,
        name: baseName(write.path),
        description: '',
        kind: 'write',
        turn: write.turn,
        at
      })
    }
  }
  const rows = [...byPath.values()].sort((a, b) => b.at - a.at).slice(0, Math.max(1, Math.min(limit, 500)))
  // 补磁盘状态：文件可能后来被删了，或干脆在别的盘上（读不到就不标）。
  await Promise.all(
    rows.map(async (row) => {
      const info = await stat(row.path).catch(() => null)
      row.exists = Boolean(info && info.isFile())
      row.size = info && info.isFile() ? info.size : 0
      row.fileMtime = info && info.isFile() ? Math.round(info.mtimeMs) : 0
    })
  )
  return rows
}

function baseName(path) {
  const parts = String(path || '').split(/[\\/]+/)
  return parts[parts.length - 1] || String(path || '')
}

/** 会话标题兜底：没有标题时用目录名 + 时间，界面不至于空白一片。 */
export function sessionLabel(session) {
  if (session.title) return session.title
  const folder = String(session.cwd || '').split(/[\\/]+/).filter(Boolean).pop()
  return folder ? `会话 · ${folder}` : `会话 · ${new Date(session.updatedAt).toLocaleString()}`
}
