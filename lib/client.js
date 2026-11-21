/**
 * DSH-library —— 客户端半侧（浏览器）。
 *
 * 这个文件必须是一段**普通副作用脚本**：没有顶层 import/export，
 * 由 DSH 的模块加载器把 require 注入进来（见 makeFactory）。
 *
 * 它只做一件事：在「设置」左栏加一个「本地资料库」分区，页面是
 * 上传区 + 检索框 + 文件列表（下载 / 删除）+ 存储信息。
 * 宿主半侧在 lib/index.js，两者通过 /dsh-local-library/* 通信。
 */
;(() => {
  const NS = 'local-library'
  const ROUTE = '/dsh-local-library'
  const STYLE_TAG = 'dsh-local-library/settings.css'
  const NAV_STYLE_TAG = 'dsh-local-library/nav-icon.css'
  const NAV_MARK = 'data-dsh-ll-nav'

  // makeSettings 在 IIFE 作用域里定义，而 jsx 工厂（h）是 makeFactory 拿到的。
  // 用一个外层可变绑定把它们串起来：工厂里赋值，组件渲染时才有 h 可用。
  let h = null

  const zh = {
    nav: '本地资料库',
    title: '本地资料库',
    subtitle: '文件存在本机，所有对话共用；新会话里的 agent 会自动看到这套工具，不用再提醒它。',
    drop: '把文件拖到这里，或点击选择',
    dropHint: '支持 PDF / Word / Excel / PPT / 文本 / 图片，单文件上限 512MB，可多选',
    search: '在资料库里检索…',
    searchBtn: '检索',
    refresh: '刷新',
    uploading: '上传中',
    indexed: '已建索引',
    indexing: '索引中…',
    noText: '无可抽取文本',
    download: '下载',
    remove: '删除',
    confirmRemove: '确认删除？',
    empty: '资料库还是空的，先传几个文件进来。',
    emptySearch: '没有命中，换个关键词试试。',
    count: (n) => `共 ${n} 个文件`,
    storage: '存储位置',
    copyPath: '复制路径',
    copied: '已复制',
    errorPrefix: '出错了：',
    uploaded: (n) => `已上传 ${n} 个文件`,
    refused: '有文件超过 512MB，已跳过：',
    refusedOnly: '以下文件超过 512MB，已跳过：',
    uploadStalled: '上传卡住了（60 秒没有进度），已自动放弃，请检查网络后重试',
    agentSaved: 'agent 存入',
    snippet: '命中片段',
    hitByName: '按文件名/标签命中（正文里没有这个词）',
    strict: '严格匹配',
    strictHint: '只保留关键词命中率高的结果；关掉则按相关度宽松返回',
    strictOn: '已开启严格匹配：擦边的结果不再返回',
    strictOff: '已切回宽松匹配：按相关度返回更多结果',
    selectOne: '选择这个文件',
    selectedCount: (n) => `已选 ${n} 个`,
    zipSelected: '打包下载',
    clearSelection: '取消选择',
    zipDone: (n) => `已打包下载 ${n} 个文件`,
    zipCapped: (used, limit) => `已打包 ${used} 个（一次最多 ${limit} 个，超出的没有打包）`,
    tags: '标签',
    editTags: '编辑标签（逗号分隔）',
    tagsPlaceholder: '例如：财务, 2026预算',
    dupeTitle: (file, existing) => `「${file}」库里已经有一模一样的内容了${existing ? `（${existing}）` : ''}，怎么办？`,
    dupeReplace: '覆盖旧的',
    dupeKeep: '再存一份',
    dupeSkip: '跳过',
    filterAll: '全部',
    filterPdf: 'PDF',
    filterWord: 'Word',
    filterSheet: '表格',
    filterPpt: 'PPT',
    filterImage: '图片',
    filterText: '文本',
    reindex: '重建索引',
    reindexing: '重建中…',
    reindexQueued: (n) => `已排队重建 ${n} 个索引`,
    usage: (size) => `占用 ${size}`,
    indexedCount: (n) => `${n} 个已建索引`
  }

  const en = {
    nav: 'Local library',
    title: 'Local library',
    subtitle: 'Files live on this machine and every conversation shares them. New sessions already know about the tools.',
    drop: 'Drop files here, or click to choose',
    dropHint: 'PDF / Word / Excel / PPT / text / images, up to 512MB per file',
    search: 'Search the library…',
    searchBtn: 'Search',
    refresh: 'Refresh',
    uploading: 'Uploading',
    indexed: 'indexed',
    indexing: 'indexing…',
    noText: 'no text',
    download: 'Download',
    remove: 'Delete',
    confirmRemove: 'Confirm delete?',
    empty: 'The library is empty — upload something first.',
    emptySearch: 'No match. Try another keyword.',
    count: (n) => `${n} file(s)`,
    storage: 'Location',
    copyPath: 'Copy path',
    copied: 'Copied',
    errorPrefix: 'Error: ',
    uploaded: (n) => `Uploaded ${n} file(s)`,
    refused: 'Skipped files above 512MB: ',
    refusedOnly: 'Skipped files above 512MB: ',
    uploadStalled: 'Upload stalled (no progress for 60s); gave up — check your connection and retry.',
    agentSaved: 'saved by agent',
    snippet: 'match',
    hitByName: 'Matched by file name or tag (not present in the body text)',
    strict: 'Strict match',
    strictHint: 'Keep only results whose keywords really match; turn off for broader relevance ranking',
    strictOn: 'Strict match on: weak matches are hidden',
    strictOff: 'Back to loose match: more results by relevance',
    selectOne: 'Select this file',
    selectedCount: (n) => `${n} selected`,
    zipSelected: 'Download as ZIP',
    clearSelection: 'Clear selection',
    zipDone: (n) => `Bundled ${n} file(s)`,
    zipCapped: (used, limit) => `Bundled ${used} file(s) (max ${limit} at a time; the rest were skipped)`,
    tags: 'Tags',
    editTags: 'Edit tags (comma separated)',
    tagsPlaceholder: 'e.g. finance, budget-2026',
    dupeTitle: (file, existing) => `Identical content already exists for “${file}”${existing ? ` (${existing})` : ''}. What now?`,
    dupeReplace: 'Replace',
    dupeKeep: 'Keep both',
    dupeSkip: 'Skip',
    filterAll: 'All',
    filterPdf: 'PDF',
    filterWord: 'Word',
    filterSheet: 'Sheet',
    filterPpt: 'PPT',
    filterImage: 'Image',
    filterText: 'Text',
    reindex: 'Rebuild index',
    reindexing: 'Rebuilding…',
    reindexQueued: (n) => `Queued ${n} index rebuild(s)`,
    usage: (size) => `${size} used`,
    indexedCount: (n) => `${n} indexed`
  }

  const MAX_BYTES = 512 * 1024 * 1024
  /** 一次打包的条目上限，要和宿主侧 BUNDLE_MAX 保持一致，否则服务端会静默截断。 */
  const MAX_BUNDLE = 300
  /** 上传多久没有任何进度就算卡死：XHR 自己不会超时，队列会永远停在"上传中"。 */
  const UPLOAD_STALL_MS = 60000
  /** 进度条刷新节流：512MB 文件每秒几十个 progress 事件，全 setState 会把页面拖卡。 */
  const PROGRESS_THROTTLE_MS = 150

  // 类型过滤条：[kind, i18n key]。kind 直接对应宿主侧解析出的 item.kind
  const FILTER_KINDS = [
    ['', 'filterAll'],
    ['pdf', 'filterPdf'],
    ['docx', 'filterWord'],
    ['xlsx', 'filterSheet'],
    ['pptx', 'filterPpt'],
    ['image', 'filterImage'],
    ['text', 'filterText']
  ]

  function formatBytes(n) {
    const v = Number(n) || 0
    if (v < 1024) return `${v} B`
    const units = ['KB', 'MB', 'GB']
    let value = v / 1024
    let i = 0
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024
      i += 1
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (x) => String(x).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return ''
    }
  }

  function cssText() {
    return [
      '.ll-root{display:flex;flex-direction:column;gap:16px;font-size:14px;line-height:1.55;padding:2px 0 24px;max-width:860px}',
      '.ll-head{display:flex;flex-direction:column;gap:4px}',
      '.ll-title{font-size:16px;font-weight:600;margin:0}',
      '.ll-sub{opacity:.62;font-size:13px;margin:0}',
      '.ll-drop{border:1px dashed rgba(127,127,127,.42);border-radius:12px;padding:26px 18px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s;display:flex;flex-direction:column;gap:6px}',
      '.ll-drop:hover{background:rgba(127,127,127,.07)}',
      '.ll-drop.over{background:rgba(76,110,245,.10);border-color:rgba(76,110,245,.65)}',
      '.ll-drop-main{font-size:14px;font-weight:500}',
      '.ll-drop-hint{font-size:12px;opacity:.6}',
      '.ll-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.ll-input{flex:1 1 220px;min-width:160px;font:inherit;font-size:13px;padding:8px 12px;border-radius:9px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;outline:none}',
      '.ll-input:focus{border-color:rgba(76,110,245,.7)}',
      '.ll-btn{font:inherit;font-size:13px;padding:6px 13px;border-radius:9px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}',
      '.ll-btn:hover{background:rgba(127,127,127,.12)}',
      '.ll-btn:disabled{opacity:.45;cursor:default}',
      '.ll-btn.primary{background:#4c6ef5;border-color:#4c6ef5;color:#fff}',
      '.ll-btn.primary:hover{background:#3b5bdb}',
      '.ll-btn.danger{color:#e5484d;border-color:rgba(229,72,77,.45)}',
      '.ll-btn.danger:hover{background:rgba(229,72,77,.10)}',
      '.ll-btn.tiny{font-size:12px;padding:3px 9px;border-radius:7px}',
      '.ll-list{display:flex;flex-direction:column;border-top:1px solid rgba(127,127,127,.18)}',
      '.ll-row{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid rgba(127,127,127,.18)}',
      '.ll-row:hover{background:rgba(127,127,127,.06)}',
      '.ll-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.ll-name{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ll-meta{font-size:12px;opacity:.6;display:flex;gap:8px;flex-wrap:wrap}',
      '.ll-kind{font-size:11px;padding:1px 6px;border-radius:5px;background:rgba(127,127,127,.16);text-transform:uppercase;letter-spacing:.3px}',
      '.ll-snippet{font-size:12px;opacity:.72;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.ll-snippet-tag{font-style:italic;opacity:.55}',
      '.ll-actions{display:flex;gap:6px;flex:none}',
      '.ll-empty{padding:26px 4px;opacity:.6;font-size:13px;text-align:center}',
      '.ll-foot{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12px;opacity:.62;border-top:1px solid rgba(127,127,127,.18);padding-top:10px}',
      '.ll-path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;opacity:.85;word-break:break-all}',
      '.ll-queue{display:flex;flex-direction:column;gap:6px;font-size:12.5px}',
      '.ll-track{height:4px;border-radius:3px;background:rgba(127,127,127,.22);overflow:hidden}',
      '.ll-fill{height:100%;background:#4c6ef5;transition:width .18s}',
      '.ll-err{color:#e5484d;font-size:12.5px}',
      '.ll-sel{flex:none;width:14px;height:14px;margin:0;cursor:pointer;accent-color:#4c6ef5}',
      '.ll-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}',
      '.ll-tag{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(76,110,245,.14);color:inherit;opacity:.9}',
      '.ll-taggedit{flex:1 1 100%;margin-top:4px;padding:5px 9px;font-size:12.5px}',
      '.ll-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.ll-strict{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.7;cursor:pointer;user-select:none}',
      '.ll-strict.on{opacity:1;font-weight:600}',
      '.ll-strict input{margin:0;cursor:pointer}',
      '.ll-chip{font:inherit;font-size:12px;padding:3px 11px;border-radius:999px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer}',
      '.ll-chip:hover{background:rgba(127,127,127,.12)}',
      '.ll-chip.on{background:rgba(76,110,245,.16);border-color:rgba(76,110,245,.6)}',
      '.ll-selbar{padding:8px 10px;border-radius:10px;background:rgba(76,110,245,.08)}',
      '.ll-dupe{border:1px solid rgba(255,169,64,.55);background:rgba(255,169,64,.10);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px}'
    ].join('\n')
  }

  function injectCss(doc) {
    if (!doc || doc.head === null) return
    if (doc.querySelector(`style[data-plugin-css="${STYLE_TAG}"]`) !== null) return
    const tag = doc.createElement('style')
    tag.dataset.plugin = 'DSH-library'
    tag.dataset.pluginCss = STYLE_TAG
    tag.textContent = cssText()
    doc.head.appendChild(tag)
  }

  /** 设置面板导航行图标的 DOM 补丁（DSH 没有给第三方分区配图标的入口）。 */
  function navCss(glyph) {
    return [
      `[${NAV_MARK}] [class*="navIcon"]{display:none}`,
      `[${NAV_MARK}]::before{content:"";flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:${glyph} center/16px 16px no-repeat;mask:${glyph} center/16px 16px no-repeat}`
    ].join('\n')
  }

  function svgMaskUri(svg) {
    const source = String(svg || '').trim()
    if (source === '') return ''
    const namespaced = /<svg[^>]*\sxmlns=/i.test(source) ? source : source.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
    return `url("data:image/svg+xml,${encodeURIComponent(namespaced.split('currentColor').join('#000'))}")`
  }

  const NAV_GLYPH =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5z"/>' +
    '<path d="M9 4h4.5A1.5 1.5 0 0 1 15 5.5v13a1.5 1.5 0 0 1-1.5 1.5H9z"/>' +
    '<path d="M16 6.2l2.6-.7 3 12.4-2.6.7z"/>' +
    '</svg>'

  function installNavIcon(labelOf) {
    const doc = typeof document === 'undefined' ? undefined : document
    const Observer = typeof MutationObserver === 'undefined' ? undefined : MutationObserver
    if (doc === undefined || Observer === undefined || doc.body === null) return () => {}
    const glyph = svgMaskUri(NAV_GLYPH)
    if (glyph === '') return () => {}

    if (doc.querySelector(`style[data-plugin-css="${NAV_STYLE_TAG}"]`) === null) {
      const tag = doc.createElement('style')
      tag.dataset.plugin = 'DSH-library'
      tag.dataset.pluginCss = NAV_STYLE_TAG
      tag.textContent = navCss(glyph)
      doc.head.appendChild(tag)
    }

    const mark = () => {
      try {
        const wanted = labelOf()
        if (!wanted) return
        // DSH 聊天流式输出时整个 body 都在变，先确认设置弹窗开着再查，
        // 否则每次 token 渲染都要在全局 DOM 里跑一遍选择器。
        const modal = doc.querySelector('[data-shortcut-modal="settings"]')
        if (modal === null) return
        const cells = modal.querySelectorAll('[class*="navCell"]')
        for (const cell of cells) {
          if (cell.hasAttribute(NAV_MARK)) continue
          const label = cell.querySelector('[class*="navLabel"]')
          if (label === null) continue
          if ((label.textContent || '').trim() === wanted) cell.setAttribute(NAV_MARK, '')
        }
      } catch {
        /* 认不出行就不管，齿轮照旧 */
      }
    }

    // 用 250ms 防抖而不是 microtask：流式输出会持续触发 mutation，
    // microtask 只在同一个任务内合并，照样会被打成高频调用。
    let timer
    const schedule = () => {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        mark()
      }, 250)
    }
    const observer = new Observer(schedule)
    observer.observe(doc.body, { childList: true, subtree: true })
    mark()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      observer.disconnect()
    }
  }

  /**
   * 设置分区本体。
   *
   * 状态顺序（client.smoke 用假 hooks 依赖这个顺序，改顺序要同步改测试）：
   * items stats query over error banner queue pendingDelete copied
   * selected tagEdit dupPrompt filter reindexing
   */
  function makeSettings({ useState, useEffect, useCallback, useRef, t }) {
    return function LocalLibrarySection() {
      const [items, setItems] = useState([])
      const [stats, setStats] = useState(null)
      const [query, setQuery] = useState('')
      const [over, setOver] = useState(false)
      const [error, setError] = useState('')
      const [banner, setBanner] = useState('')
      const [queue, setQueue] = useState([])
      const [pendingDelete, setPendingDelete] = useState('')
      const [copied, setCopied] = useState(false)
      const [selected, setSelected] = useState([])
      const [tagEdit, setTagEdit] = useState(null)
      const [dupPrompt, setDupPrompt] = useState(null)
      const [filter, setFilter] = useState('')
      const [reindexing, setReindexing] = useState(false)
      // 严格匹配：默认宽松，可在设置页打开；值同时保存在库目录的 settings.json 里。
      const [matchMode, setMatchMode] = useState('loose')
      const inputRef = useRef(null)
      const alive = useRef(true)
      /** 按了 Esc 要取消编辑，但卸载 input 会触发 blur —— 用这个标记让 blur 不要保存。 */
      const tagAbort = useRef(false)

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      const load = useCallback(async (keyword, kind) => {
        const kindFilter = kind === undefined ? '' : kind
        const composed = [keyword || '', kindFilter ? `kind:${kindFilter}` : ''].filter(Boolean).join(' ')
        try {
          const res = await fetch(`${ROUTE}/list?q=${encodeURIComponent(composed)}&limit=300`, {
            headers: { accept: 'application/json' }
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (!alive.current) return
          setItems(Array.isArray(data.items) ? data.items : [])
          setStats(data.stats || null)
          // 过滤条件写错（after:2026-13-99）时服务端会回 warnings，得让用户看见，
          // 不然他以为按日期筛过了。
          setBanner(Array.isArray(data.warnings) && data.warnings.length > 0 ? data.warnings.join('；') : '')
          setError('')
        } catch (err) {
          if (alive.current) setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
        }
      }, [])

      useEffect(() => {
        void load('', '')
      }, [load])

      // 读设置（只有 matchMode 一项）：失败就当宽松匹配，不打断页面。
      useEffect(() => {
        let cancelled = false
        fetch(`${ROUTE}/config`, { headers: { accept: 'application/json' } })
          .then((res) => (res.ok ? res.json() : null))
          .then((cfg) => {
            if (cancelled || !cfg) return
            setMatchMode(cfg.matchMode === 'strict' ? 'strict' : 'loose')
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [])

      /** 切换严格匹配：先乐观更新，写回失败再退回原值并报错。 */
      const toggleStrict = useCallback(() => {
        const next = matchMode === 'strict' ? 'loose' : 'strict'
        const previous = matchMode
        setMatchMode(next)
        fetch(`${ROUTE}/config`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ matchMode: next })
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (!alive.current) return
            setBanner(t(next === 'strict' ? 'strictOn' : 'strictOff'))
            await load(query, filter)
          })
          .catch((err) => {
            if (!alive.current) return
            setMatchMode(previous)
            setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
          })
      }, [matchMode, query, filter, load])

      /** 解析上传响应；409 表示"库里已有同一份内容"，交给用户决定怎么办。 */
      const sendUpload = useCallback(
        (file, key, dupMode, folder) =>
          new Promise((resolve) => {
            const xhr = new XMLHttpRequest()
            const suffix = dupMode ? `&dup=${encodeURIComponent(dupMode)}` : ''
            // 拖文件夹时把顶层文件夹名挂成标签，方便以后按来源筛
            const tagPart = folder ? `&tags=${encodeURIComponent(folder)}` : ''
            xhr.open('POST', `${ROUTE}/upload?name=${encodeURIComponent(file.name)}${suffix}${tagPart}`)
            xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
            let lastBeat = Date.now()
            let lastTick = 0
            let lastPct = -1
            let stalled = false
            // XHR 没有内置超时：网络断了但连接还挂着时 Promise 永不 settle，
            // 队列项就一直显示"上传中"。这里做心跳看门狗，60 秒没进度直接放弃。
            const watchdog = setInterval(() => {
              if (Date.now() - lastBeat < UPLOAD_STALL_MS) return
              stalled = true
              try {
                xhr.abort()
              } catch {
                /* ignore */
              }
            }, 5000)
            const finish = (result) => {
              clearInterval(watchdog)
              resolve(result)
            }
            xhr.upload.onprogress = (event) => {
              lastBeat = Date.now()
              if (!event.lengthComputable) return
              const pct = Math.min(99, Math.round((event.loaded / event.total) * 100))
              if (pct === lastPct) return
              const now = Date.now()
              // 节流：最多每 PROGRESS_THROTTLE_MS 刷一次进度
              if (now - lastTick < PROGRESS_THROTTLE_MS) return
              lastPct = pct
              lastTick = now
              if (!alive.current) return
              setQueue((prev) => prev.map((entry) => (entry.key === key ? { ...entry, pct } : entry)))
            }
            const parse = () => {
              try {
                return JSON.parse(xhr.responseText || '{}')
              } catch {
                return {}
              }
            }
            xhr.onload = () =>
              finish({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parse() })
            xhr.onerror = () => finish({ ok: false, status: 0, body: { error: 'network error' } })
            xhr.onabort = () =>
              finish({ ok: false, status: 0, body: { error: stalled ? 'stalled' : 'aborted' } })
            xhr.send(file)
          }),
        []
      )

      const askDuplicate = useCallback(
        (file, info) =>
          new Promise((resolve) => {
            setDupPrompt({
              fileName: file.name,
              existing: info || null,
              answer: (choice) => {
                setDupPrompt(null)
                resolve(choice)
              }
            })
          }),
        []
      )

      const uploadOne = useCallback(
        async (pair) => {
          const file = pair && pair.file ? pair.file : pair
          const folder = pair && pair.folder ? pair.folder : ''
          const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          if (alive.current) setQueue((prev) => [...prev, { key, name: file.name, pct: 0 }])
          try {
            let res = await sendUpload(file, key, '', folder)
            if (res.status === 409 && res.body && res.body.duplicate) {
              const choice = await askDuplicate(file, res.body.duplicate)
              if (!choice || choice === 'skip') return false
              res = await sendUpload(file, key, choice, folder)
            }
            if (res.ok) return true
            const code = res.body && res.body.error
            const message = code === 'stalled' ? t('uploadStalled') : code || `HTTP ${res.status}`
            if (alive.current) setError(t('errorPrefix') + `${file.name}: ${message}`)
            return false
          } finally {
            if (alive.current) setQueue((prev) => prev.filter((entry) => entry.key !== key))
          }
        },
        [askDuplicate, sendUpload, t]
      )

      /**
       * 把 drop 事件里的东西摊平成文件列表。
       * 拖文件夹时浏览器只在 webkitGetAsEntry 里给目录句柄，要递归读。
       */
      const collectDropped = useCallback(async (dataTransfer) => {
        const out = []
        const dt = dataTransfer
        if (!dt) return out
        const items = dt.items ? Array.from(dt.items) : []
        const supportsEntries = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function'
        if (!supportsEntries) {
          return Array.from(dt.files || []).map((file) => ({ file, folder: '' }))
        }

        const readEntry = async (entry, folder) => {
          if (!entry) return
          if (entry.isFile) {
            const file = await new Promise((resolve) => {
              try {
                entry.file(resolve, () => resolve(null))
              } catch {
                resolve(null)
              }
            })
            if (file) out.push({ file, folder })
            return
          }
          if (entry.isDirectory) {
            const reader = entry.createReader()
            const children = []
            // readEntries 一次最多返回一批（Chrome 100 条），要一直读到空为止
            for (;;) {
              const batch = await new Promise((resolve) => {
                try {
                  reader.readEntries(resolve, () => resolve([]))
                } catch {
                  resolve([])
                }
              })
              if (!batch || batch.length === 0) break
              children.push(...batch)
            }
            const name = folder || entry.name || ''
            for (const child of children) await readEntry(child, name)
          }
        }

        for (const item of items) {
          if (typeof item.webkitGetAsEntry !== 'function') continue
          const entry = item.webkitGetAsEntry()
          await readEntry(entry, '')
        }
        if (out.length === 0) return Array.from(dt.files || []).map((file) => ({ file, folder: '' }))
        return out
      }, [])

      const uploadFiles = useCallback(
        async (pairs) => {
          const list = Array.isArray(pairs) ? pairs : []
          if (list.length === 0) return
          const tooBig = list.filter((pair) => pair.file.size > MAX_BYTES)
          const ok = list.filter((pair) => pair.file.size <= MAX_BYTES)
          const refused = tooBig.length > 0 ? `${t('refusedOnly')}${tooBig.map((pair) => pair.file.name).join('、')}` : ''
          if (refused) setBanner(refused)
          let done = 0
          for (const pair of ok) {
            const success = await uploadOne(pair)
            if (success) done += 1
          }
          if (alive.current) {
            // 「已上传 N 个」不能把「这些文件太大被跳过」盖掉，两条拼起来显示。
            const uploaded = ok.length > 0 ? t('uploaded', done) : ''
            if (refused || uploaded) setBanner([refused, uploaded].filter(Boolean).join('　·　'))
            setQuery('')
            setFilter('')
            await load('', '')
          }
        },
        [load, uploadOne, t]
      )

      const onPick = useCallback(
        (event) => {
          const files = Array.from(event.target.files || []).map((file) => ({ file, folder: '' }))
          void uploadFiles(files)
          if (inputRef.current) inputRef.current.value = ''
        },
        [uploadFiles]
      )

      const onDrop = useCallback(
        (event) => {
          event.preventDefault()
          setOver(false)
          void (async () => {
            const pairs = await collectDropped(event.dataTransfer)
            await uploadFiles(pairs)
          })()
        },
        [collectDropped, uploadFiles]
      )

      const remove = useCallback(async (id) => {
        try {
          const res = await fetch(`${ROUTE}/item?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          if (alive.current) {
            setPendingDelete('')
            setSelected((prev) => prev.filter((entry) => entry !== id))
          }
          await load(query, filter)
        } catch (err) {
          if (alive.current) setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
        }
      }, [filter, load, query])

      const saveTags = useCallback(async (id, raw) => {
        const tags = String(raw || '')
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
        try {
          const res = await fetch(`${ROUTE}/item?id=${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tags })
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          if (alive.current) setTagEdit(null)
          await load(query, filter)
        } catch (err) {
          if (alive.current) setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
        }
      }, [filter, load, query])

      const toggleSelected = useCallback((id) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]))
      }, [])

      const downloadSelected = useCallback(async () => {
        const all = selected.slice()
        if (all.length === 0) return
        // 服务端一次最多打包 MAX_BUNDLE 个，这里先截断并说清楚，别让人以为全打进去了。
        const ids = all.slice(0, MAX_BUNDLE)
        try {
          const res = await fetch(`${ROUTE}/bundle`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `本地资料库-${new Date().toISOString().slice(0, 10)}.zip`
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
          if (alive.current) setBanner(all.length > ids.length ? t('zipCapped', ids.length, MAX_BUNDLE) : t('zipDone', ids.length))
        } catch (err) {
          if (alive.current) setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
        }
      }, [selected, t])

      const reindexAll = useCallback(async () => {
        setReindexing(true)
        try {
          const res = await fetch(`${ROUTE}/reindex?all=1`, { method: 'POST' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (alive.current) setBanner(t('reindexQueued', Number(data.queued) || 0))
        } catch (err) {
          if (alive.current) setError(t('errorPrefix') + (err && err.message ? err.message : String(err)))
        } finally {
          if (alive.current) setReindexing(false)
        }
      }, [t])

      const copyPath = useCallback(async () => {
        const path = stats && stats.root ? stats.root : ''
        if (!path) return
        try {
          await navigator.clipboard.writeText(path)
          setCopied(true)
          setTimeout(() => {
            if (alive.current) setCopied(false)
          }, 1500)
        } catch {
          /* 剪贴板不可用就静默 */
        }
      }, [stats])

      const submitSearch = useCallback(
        (event) => {
          event.preventDefault()
          void load(query, filter)
        },
        [filter, load, query]
      )

      const pickFilter = useCallback(
        (kind) => {
          setFilter(kind)
          void load(query, kind)
        },
        [load, query]
      )

      const rows = items.map((item) => {
        const metaBits = [
          formatBytes(item.size),
          item.indexed ? (item.textChars > 0 ? `${item.textChars} 字 ${t('indexed')}` : t('noText')) : t('indexing'),
          formatDate(item.createdAt)
        ].filter(Boolean)
        const checked = selected.indexOf(item.id) >= 0
        const tags = Array.isArray(item.tags) ? item.tags : []
        return h(
          'div',
          { className: 'll-row', key: item.id },
          h('input', {
            className: 'll-sel',
            type: 'checkbox',
            checked: checked,
            title: t('selectOne'),
            onChange: () => toggleSelected(item.id)
          }),
          h(
            'div',
            { className: 'll-main' },
            h('div', { className: 'll-name', title: item.name }, item.name),
            h(
              'div',
              { className: 'll-meta' },
              h('span', { className: 'll-kind' }, String(item.kind || 'file')),
              metaBits.map((bit, index) => h('span', { key: `m${index}` }, bit)),
              item.addedBy === 'agent' ? h('span', null, t('agentSaved')) : null
            ),
            tags.length > 0 && !(tagEdit && tagEdit.id === item.id)
              ? h(
                  'div',
                  { className: 'll-tags' },
                  tags.map((tag, index) => h('span', { className: 'll-tag', key: `t${index}` }, tag))
                )
              : null,
            tagEdit && tagEdit.id === item.id
              ? h('input', {
                  className: 'll-input ll-taggedit',
                  value: tagEdit.value,
                  autoFocus: true,
                  placeholder: t('tagsPlaceholder'),
                  onChange: (event) => setTagEdit({ id: item.id, value: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      tagAbort.current = false
                      void saveTags(item.id, tagEdit.value)
                    }
                    if (event.key === 'Escape') {
                      // 取消：先立标记，blur 就不会把旧值存回去
                      tagAbort.current = true
                      setTagEdit(null)
                    }
                  },
                  onBlur: () => {
                    if (tagAbort.current) {
                      tagAbort.current = false
                      return
                    }
                    void saveTags(item.id, tagEdit.value)
                  }
                })
              : null,
            item.snippet
              ? h('div', { className: 'll-snippet' }, item.snippet)
              : item.matchedBy === 'name'
                ? h('div', { className: 'll-snippet ll-snippet-tag' }, t('hitByName'))
                : null
          ),
          h(
            'div',
            { className: 'll-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'll-btn tiny',
                title: t('editTags'),
                onClick: () => setTagEdit({ id: item.id, value: tags.join(', ') })
              },
              t('tags')
            ),
            h(
              'a',
              {
                className: 'll-btn tiny',
                href: `${ROUTE}/download?id=${encodeURIComponent(item.id)}`,
                download: item.name,
                title: t('download')
              },
              t('download')
            ),
            h(
              'button',
              {
                type: 'button',
                className: pendingDelete === item.id ? 'll-btn tiny danger' : 'll-btn tiny',
                onClick: () => {
                  if (pendingDelete === item.id) void remove(item.id)
                  else setPendingDelete(item.id)
                }
              },
              pendingDelete === item.id ? t('confirmRemove') : t('remove')
            )
          )
        )
      })

      const filterChips = FILTER_KINDS.map(([kind, label]) =>
        h(
          'button',
          {
            type: 'button',
            key: kind || 'all',
            className: filter === kind ? 'll-chip on' : 'll-chip',
            onClick: () => pickFilter(kind)
          },
          t(label)
        )
      )

      return h(
        'div',
        { className: 'll-root' },
        h(
          'div',
          { className: 'll-head' },
          h('h2', { className: 'll-title' }, t('title')),
          h('p', { className: 'll-sub' }, t('subtitle'))
        ),

        h(
          'div',
          {
            className: over ? 'll-drop over' : 'll-drop',
            onClick: () => inputRef.current && inputRef.current.click(),
            onDragOver: (event) => {
              event.preventDefault()
              setOver(true)
            },
            onDragLeave: () => setOver(false),
            onDrop: onDrop,
            role: 'button',
            tabIndex: 0
          },
          h('div', { className: 'll-drop-main' }, t('drop')),
          h('div', { className: 'll-drop-hint' }, t('dropHint')),
          h('input', {
            ref: inputRef,
            type: 'file',
            multiple: true,
            style: { display: 'none' },
            onChange: onPick
          })
        ),

        queue.length > 0
          ? h(
              'div',
              { className: 'll-queue' },
              queue.map((entry) =>
                h(
                  'div',
                  { key: entry.key },
                  h('div', { className: 'll-meta' }, `${t('uploading')} · ${entry.name} · ${entry.pct}%`),
                  h('div', { className: 'll-track' }, h('div', { className: 'll-fill', style: { width: `${entry.pct}%` } }))
                )
              )
            )
          : null,

        dupPrompt
          ? h(
              'div',
              { className: 'll-dupe' },
              h('div', null, t('dupeTitle', dupPrompt.fileName, dupPrompt.existing ? dupPrompt.existing.name : '')),
              h(
                'div',
                { className: 'll-bar' },
                h('button', { type: 'button', className: 'll-btn tiny primary', onClick: () => dupPrompt.answer('replace') }, t('dupeReplace')),
                h('button', { type: 'button', className: 'll-btn tiny', onClick: () => dupPrompt.answer('keep') }, t('dupeKeep')),
                h('button', { type: 'button', className: 'll-btn tiny', onClick: () => dupPrompt.answer('skip') }, t('dupeSkip'))
              )
            )
          : null,

        h(
          'form',
          { className: 'll-bar', onSubmit: submitSearch },
          h('input', {
            className: 'll-input',
            value: query,
            placeholder: t('search'),
            onChange: (event) => setQuery(event.target.value)
          }),
          h('button', { className: 'll-btn primary', type: 'submit' }, t('searchBtn')),
          h(
            'button',
            {
              className: 'll-btn',
              type: 'button',
              onClick: () => {
                setQuery('')
                setFilter('')
                setBanner('')
                void load('', '')
              }
            },
            t('refresh')
          )
        ),

        h(
          'div',
          { className: 'll-chips' },
          filterChips,
          h(
            'label',
            {
              className: `ll-strict${matchMode === 'strict' ? ' on' : ''}`,
              title: t('strictHint')
            },
            h('input', { type: 'checkbox', checked: matchMode === 'strict', onChange: () => toggleStrict() }),
            h('span', null, t('strict'))
          )
        ),

        selected.length > 0
          ? h(
              'div',
              { className: 'll-bar ll-selbar' },
              h('span', { className: 'll-meta' }, t('selectedCount', selected.length)),
              h('button', { type: 'button', className: 'll-btn tiny primary', onClick: () => void downloadSelected() }, t('zipSelected')),
              h('button', { type: 'button', className: 'll-btn tiny', onClick: () => setSelected([]) }, t('clearSelection'))
            )
          : null,

        error ? h('div', { className: 'll-err' }, error) : null,
        banner ? h('div', { className: 'll-meta' }, banner) : null,

        rows.length > 0
          ? h('div', { className: 'll-list' }, rows)
          : h('div', { className: 'll-empty' }, query || filter ? t('emptySearch') : t('empty')),

        h(
          'div',
          { className: 'll-foot' },
          h('span', null, stats ? t('count', stats.count) : ''),
          h('span', null, stats ? t('usage', stats.bytesText) : ''),
          h('span', null, stats ? t('indexedCount', stats.indexed) : ''),
          h(
            'button',
            { type: 'button', className: 'll-btn tiny', disabled: reindexing, onClick: () => void reindexAll() },
            reindexing ? t('reindexing') : t('reindex')
          ),
          stats && stats.root
            ? h(
                'span',
                null,
                `${t('storage')}：`,
                h('span', { className: 'll-path' }, stats.root),
                ' ',
                h('button', { className: 'll-btn tiny', type: 'button', onClick: copyPath }, copied ? t('copied') : t('copyPath'))
              )
            : null
        )
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 侧边栏入口 + 主面板
  //
  // 侧栏那个图标由 sidebar.panellist 槽负责，点开后在 main 槽里渲染这整块面板：
  // 左树（文件夹）+ 右列表（文件）+ 预览抽屉，行为对齐资源管理器常用的那一套——
  // 拖文件到文件夹上就是移动，拖系统里的文件夹进来就整棵搬进来，改名和备注都就地改。
  // ══════════════════════════════════════════════════════════════════════
  const PANEL_ID = 'local-library'
  const PANEL_STYLE_TAG = 'dsh-local-library/panel.css'
  /** 内部拖拽用的自定义 mime：只搬 id，不搬内容，跨面板也不会误判成文件上传。 */
  const DRAG_ITEMS = 'application/x-ll-items'

  const PANEL_ZH = {
    panelTitle: '本地资料库',
    allFiles: '全部文件',
    recent: '最近访问',
    work: '工作生成文件',
    newFolder: '新建文件夹',
    uploadFile: '上传文件',
    uploadFolder: '上传文件夹',
    refresh: '刷新',
    searchPlaceholder: '搜文件名、备注、文件夹或正文…',
    folderNamePlaceholder: '文件夹名',
    remarkPlaceholder: '给它写一句备注（例如：导师改过的版本）',
    emptyRoot: '资料库还是空的。把文件或整个文件夹拖进来，或点上面的「上传」。',
    emptyFolder: '这个文件夹是空的。把文件拖进来就能归档。',
    emptyRecent: '还没有访问记录。打开过、下载过的文件会出现在这里。',
    emptyWork: '还没有在本机生成过文件。让 agent 做一份出来，这里就能看到。',
    emptySearch: '没有命中，换个词试试。',
    folders: (n) => `${n} 个文件夹`,
    files: (n) => `${n} 个文件`,
    rename: '改名',
    remark: '备注',
    remove: '删除',
    open: '打开',
    download: '下载',
    locate: '定位到聊天',
    saveToLib: '存入资料库',
    savedAlready: '已在资料库里',
    move: '移到…',
    confirmRemoveFile: (name) => `把「${name}」移到回收站？（30 天内可以还原）`,
    confirmRemoveFolder: (name) => `删除文件夹「${name}」？里面的文件会移到上一层，不会被删。`,
    confirmRemoveFolderDeep: (name) => `连同里面的文件一起删掉「${name}」及其子文件夹？这个操作不能撤销。`,
    removed: (n) => `已移到回收站 ${n} 项`,
    moved: (n) => `已移动 ${n} 项`,
    saved: '已保存',
    uploading: (n) => `正在上传 ${n} 个文件…`,
    uploaded: (n) => `已上传 ${n} 个文件`,
    uploadFailed: (name) => `「${name}」上传失败`,
    dropHere: '松手放进这个文件夹',
    dropRoot: '松手放到资料库根目录',
    dropFiles: '松手导入（保留文件夹结构）',
    dropMove: (n) => `移动 ${n} 项到这里`,
    noText: '这个文件没有可读正文（图片可以看视觉描述，二进制只能下载）。',
    loading: '加载中…',
    accessAt: (time) => `上次打开 ${time}`,
    accessCount: (n) => `打开过 ${n} 次`,
    agentSaved: 'agent 存入',
    located: '已跳转到对应会话',
    locateFailed: '这个环境里没法跳转会话（找不到工作区服务），可以按会话标题去会话列表里找。',
    copyPath: '复制路径',
    copied: '已复制',
    close: '关闭',
    loadFailed: (msg) => `读取出错：${msg}`,
    folderDepthHint: '拖到文件夹上可以移动',
    deliverable: '交付',
    write: '写过',
    missing: '已不在磁盘上',
    sessionFiles: (n) => `${n} 个文件`,
    breadcrumbRoot: '资料库',
    parentFolder: '返回上一层',
    selectAll: '全选',
    clearSel: '取消选择',
    selectedN: (n) => `已选 ${n} 项`,
    batchMove: '移到…',
    batchRemark: '批量备注',
    batchDownload: '打包下载',
    batchDelete: (n) => `删除 ${n} 项`,
    toRoot: '资料库根目录',
    confirmRemoveMany: (n) => `把选中的 ${n} 个文件移到回收站？（30 天内可以还原）`,
    remarkAppendHint: '追加到每份文件已有的备注后面',
    applyRemark: '写入备注',
    remarkSaved: (n) => `已写入 ${n} 条备注`,
    trash: '回收站',
    trashHint: (n) => `回收站保留 ${n} 天，过期自动清理；在回收站里点「还原」就能放回去。`,
    trashEmpty: '回收站是空的',
    trashEmptyAction: '清空回收站',
    trashCount: (n) => `${n} 项待清理`,
    confirmPurge: (n) => `彻底删除选中的 ${n} 个文件？文件会被真删掉，不能还原。`,
    confirmEmptyTrash: '彻底删除回收站里的全部文件？这个操作不能撤销。',
    restore: '还原',
    purge: '彻底删除',
    restoreN: (n) => `已还原 ${n} 项`,
    purgeN: (n) => `已清理 ${n} 项`,
    batchRestore: (n) => `还原 ${n} 项`,
    batchPurge: (n) => `彻底删除 ${n} 项`,
    edit: '编辑',
    save: '保存',
    cancel: '取消',
    savedOk: '已写回文件',
    notEditable: '这个类型不能在面板里直接改：PDF、图片、Office 只能下载后改完再上传。',
    editHint: 'Ctrl+S 保存 · Esc 退出编辑'
  }

  const PANEL_EN = {
    panelTitle: 'Local library',
    allFiles: 'All files',
    recent: 'Recently opened',
    work: 'Files made here',
    newFolder: 'New folder',
    uploadFile: 'Upload files',
    uploadFolder: 'Upload folder',
    refresh: 'Refresh',
    searchPlaceholder: 'Search names, notes, folders, text…',
    folderNamePlaceholder: 'Folder name',
    remarkPlaceholder: 'A note for future you (e.g. “this is the version my advisor edited”)',
    emptyRoot: 'The library is empty. Drop files or whole folders here, or use Upload.',
    emptyFolder: 'This folder is empty. Drop files in to file them away.',
    emptyRecent: 'Nothing opened yet. Files you open or download show up here.',
    emptyWork: 'No files generated on this machine yet.',
    emptySearch: 'No match. Try another word.',
    folders: (n) => `${n} folder(s)`,
    files: (n) => `${n} file(s)`,
    rename: 'Rename',
    remark: 'Note',
    remove: 'Delete',
    open: 'Open',
    download: 'Download',
    locate: 'Go to chat',
    saveToLib: 'Save to library',
    savedAlready: 'Already in library',
    move: 'Move to…',
    confirmRemoveFile: (name) => `Move “${name}” to the trash? You can restore it for 30 days.`,
    confirmRemoveFolder: (name) => `Delete folder “${name}”? Files inside move up one level.`,
    confirmRemoveFolderDeep: (name) => `Delete “${name}” and everything inside? This cannot be undone.`,
    removed: (n) => `Moved ${n} item(s) to the trash`,
    moved: (n) => `Moved ${n} item(s)`,
    saved: 'Saved',
    uploading: (n) => `Uploading ${n} file(s)…`,
    uploaded: (n) => `Uploaded ${n} file(s)`,
    uploadFailed: (name) => `Upload failed: ${name}`,
    dropHere: 'Drop into this folder',
    dropRoot: 'Drop into the library root',
    dropFiles: 'Drop to import (folder structure kept)',
    dropMove: (n) => `Move ${n} item(s) here`,
    noText: 'No extractable text (images have a vision description; binaries can only be downloaded).',
    loading: 'Loading…',
    accessAt: (time) => `opened ${time}`,
    accessCount: (n) => `opened ${n}×`,
    agentSaved: 'saved by agent',
    located: 'Jumped to the session',
    locateFailed: 'Cannot jump here (workspace service unavailable); find the chat by its title.',
    copyPath: 'Copy path',
    copied: 'Copied',
    close: 'Close',
    loadFailed: (msg) => `Load failed: ${msg}`,
    folderDepthHint: 'Drop onto a folder to move',
    deliverable: 'delivered',
    write: 'written',
    missing: 'no longer on disk',
    sessionFiles: (n) => `${n} file(s)`,
    breadcrumbRoot: 'Library',
    parentFolder: 'Up one level',
    selectAll: 'Select all',
    clearSel: 'Clear',
    selectedN: (n) => `${n} selected`,
    batchMove: 'Move to…',
    batchRemark: 'Batch note',
    batchDownload: 'Download zip',
    batchDelete: (n) => `Delete ${n}`,
    toRoot: 'Library root',
    confirmRemoveMany: (n) => `Move ${n} selected file(s) to the trash? You can restore them for 30 days.`,
    remarkAppendHint: 'Appended after each file\'s existing note',
    applyRemark: 'Apply note',
    remarkSaved: (n) => `Note written to ${n} file(s)`,
    trash: 'Trash',
    trashHint: (n) => `Deleted files stay here for ${n} days, then get cleaned up. Click Restore to put one back.`,
    trashEmpty: 'Trash is empty',
    trashEmptyAction: 'Empty trash',
    trashCount: (n) => `${n} item(s) to clean up`,
    confirmPurge: (n) => `Permanently delete ${n} selected file(s)? This cannot be undone.`,
    confirmEmptyTrash: 'Permanently delete everything in the trash? This cannot be undone.',
    restore: 'Restore',
    purge: 'Delete forever',
    restoreN: (n) => `Restored ${n} item(s)`,
    purgeN: (n) => `Cleaned up ${n} item(s)`,
    batchRestore: (n) => `Restore ${n}`,
    batchPurge: (n) => `Delete ${n} forever`,
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    savedOk: 'Saved to file',
    notEditable: 'This type cannot be edited here: PDF, images and Office files must be downloaded, edited, then uploaded again.',
    editHint: 'Ctrl+S to save · Esc to leave'
  }

  function panelCssText() {
    return [
      '.llp-root{display:flex;height:100%;min-height:0;font-size:13.5px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit)}',
      '.llp-side{flex:none;width:214px;display:flex;flex-direction:column;gap:2px;padding:14px 8px 18px;border-right:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));overflow-y:auto;min-height:0}',
      '.llp-sidehead{font-size:12px;letter-spacing:.4px;text-transform:uppercase;opacity:.5;padding:0 8px 8px}',
      '.llp-nav{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;border:1px solid transparent;color:inherit;background:none;font:inherit;text-align:left;width:100%}',
      '.llp-nav:hover{background:rgba(127,127,127,.10)}',
      '.llp-nav.on{background:rgba(76,110,245,.14);border-color:rgba(76,110,245,.32);font-weight:600}',
      '.llp-nav .llp-badge{margin-left:auto;font-size:11px;opacity:.55;font-weight:400}',
      '.llp-treelabel{font-size:12px;letter-spacing:.4px;text-transform:uppercase;opacity:.5;padding:14px 8px 6px}',
      '.llp-tree{display:flex;flex-direction:column;gap:1px}',
      '.llp-folder{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:7px;cursor:pointer;border:1px solid transparent;color:inherit;background:none;font:inherit;width:100%;text-align:left}',
      '.llp-folder:hover{background:rgba(127,127,127,.10)}',
      '.llp-folder.on{background:rgba(76,110,245,.14);border-color:rgba(76,110,245,.32)}',
      '.llp-folder.over{background:rgba(76,110,245,.22);border-color:rgba(76,110,245,.6);border-style:dashed}',
      '.llp-folder .llp-fname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.llp-twisty{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;opacity:.55;cursor:pointer}',
      '.llp-twisty.spacer{visibility:hidden}',
      '.llp-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}',
      '.llp-top{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));flex-wrap:wrap}',
      '.llp-crumb{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0;flex:1 1 200px}',
      '.llp-crumbbtn{font:inherit;font-size:13px;background:none;border:none;color:inherit;cursor:pointer;padding:2px 4px;border-radius:6px;opacity:.85}',
      '.llp-crumbbtn:hover{background:rgba(127,127,127,.14);opacity:1}',
      '.llp-crumbcur{font-weight:600;opacity:1}',
      '.llp-sep{opacity:.35}',
      '.llp-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.llp-search{display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:9px;background:transparent;max-width:320px;flex:1 1 200px}',
      '.llp-search input{flex:1;min-width:0;border:none;background:transparent;color:inherit;font:inherit;font-size:13px;padding:7px 0;outline:none}',
      '.llp-body{flex:1;min-height:0;overflow-y:auto;padding:6px 10px 22px}',
      '.llp-body.drop{background:rgba(76,110,245,.06)}',
      '.llp-row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid transparent;cursor:pointer}',
      '.llp-row:hover{background:rgba(127,127,127,.08)}',
      '.llp-row.on{background:rgba(76,110,245,.12);border-color:rgba(76,110,245,.32)}',
      '.llp-row.dragging{opacity:.5}',
      '.llp-ico{flex:none;width:26px;height:26px;border-radius:7px;background:rgba(127,127,127,.12);display:flex;align-items:center;justify-content:center;opacity:.85;margin-top:1px}',
      '.llp-rowmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.llp-rowname{font-size:13.5px;font-weight:500;line-height:1.36;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
      '.llp-rowmeta{font-size:11.5px;opacity:.6;display:flex;gap:7px;flex-wrap:wrap;align-items:center}',
      '.llp-remarkline{font-size:12px;opacity:.9;color:var(--dsw-alias-label-secondary,inherit);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.llp-remarkline::before{content:"备注 " ;opacity:.5;font-size:11px}',
      '.llp-rowact{flex:none;display:flex;gap:4px;opacity:0;transition:opacity .12s}',
      '.llp-row:hover .llp-rowact,.llp-row.on .llp-rowact{opacity:1}',
      '.llp-mini{font:inherit;font-size:11.5px;padding:2px 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;color:inherit;cursor:pointer;white-space:nowrap}',
      '.llp-mini:hover{background:rgba(127,127,127,.14)}',
      '.llp-mini.danger{color:var(--dsw-alias-state-error-primary,#e5484d);border-color:rgba(229,72,77,.4)}',
      '.llp-mini.main{background:#4c6ef5;border-color:#4c6ef5;color:#fff}',
      '.llp-mini.main:hover{background:#3b5bdb}',
      '.llp-empty{padding:44px 20px;text-align:center;opacity:.55;font-size:13px;line-height:1.8}',
      '.llp-grouphead{display:flex;align-items:center;gap:8px;padding:14px 8px 4px;font-size:12px;opacity:.75;flex-wrap:wrap}',
      '.llp-grouptitle{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%}',
      '.llp-grouptime{opacity:.6;font-size:11.5px}',
      '.llp-chip{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.16)}',
      '.llp-chip.warn{background:rgba(229,72,77,.14);color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.llp-chip.blue{background:rgba(76,110,245,.16)}',
      '.llp-editrow{display:flex;gap:6px;align-items:center;padding:4px 8px 8px 24px}',
      '.llp-input{flex:1;min-width:0;font:inherit;font-size:13px;padding:5px 9px;border-radius:8px;border:1px solid rgba(76,110,245,.55);background:transparent;color:inherit;outline:none}',
      '.llp-dropzone{margin:10px 16px 0;border:1px dashed rgba(127,127,127,.42);border-radius:12px;padding:16px;text-align:center;font-size:13px;opacity:.75}',
      '.llp-preview{flex:none;width:min(46%,460px);border-left:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1,transparent)}',
      '.llp-pvhead{padding:12px 14px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));display:flex;flex-direction:column;gap:4px}',
      '.llp-pvtitle{font-weight:600;overflow-wrap:anywhere}',
      '.llp-pvmeta{font-size:11.5px;opacity:.6;display:flex;gap:8px;flex-wrap:wrap}',
      '.llp-pvact{display:flex;gap:6px;flex-wrap:wrap;padding-top:6px}',
      '.llp-pvtext{flex:1;min-height:0;overflow:auto;padding:12px 14px 24px;white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.65}',
      '.llp-pvremark{margin:8px 14px 0;padding:8px 10px;border-radius:8px;background:rgba(255,169,64,.12);font-size:12px;white-space:pre-wrap}',
      '.llp-toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(30,30,30,.9);color:#fff;font-size:12.5px;z-index:30;max-width:80%;text-align:center}',
      '.llp-toast.err{background:rgba(190,45,50,.94)}',
      '.llp-wrap{position:relative;display:flex;flex-direction:column;height:100%;min-height:0}',
      '.llp-loading{opacity:.55;padding:10px 16px;font-size:12.5px}',
      '.llp-hint{font-size:11.5px;opacity:.45;padding:2px 8px}',
      '.llp-check{display:flex;align-items:center;justify-content:center;width:16px;flex:none;opacity:.5}',
      '.llp-check input{cursor:pointer;margin:0}',
      '.llp-batch{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));background:rgba(127,127,127,.06)}',
      '.llp-batchcount{font-size:12px;font-weight:600;margin-right:2px}',
      '.llp-movemenu{display:flex;flex-wrap:wrap;gap:4px;padding-top:4px;width:100%}',
      '.llp-moveopt{font-size:11.5px;padding:3px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));background:transparent;color:inherit;cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.llp-batchremark{display:flex;flex-direction:column;gap:6px;width:100%;padding-top:4px}',
      '.llp-editor{flex:1;min-height:0;margin:0;border:0;outline:none;resize:none;padding:12px 14px 24px;background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;tab-size:2}'
    ].join('\n')
  }

  function injectPanelCss(doc) {
    if (!doc || doc.head === null) return
    if (doc.querySelector(`style[data-plugin-css="${PANEL_STYLE_TAG}"]`) !== null) return
    const tag = doc.createElement('style')
    tag.dataset.plugin = 'DSH-library'
    tag.dataset.pluginCss = PANEL_STYLE_TAG
    tag.textContent = panelCssText()
    doc.head.appendChild(tag)
  }

  /** 一套 16px 线框图标，内联 SVG 免得依赖图标包版本。 */
  const PANEL_GLYPHS = {
    folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l1.6 1.8h5.4A1.5 1.5 0 0 1 17 8.3v7.2A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5z',
    file: 'M12.5 3H6.5A1.5 1.5 0 0 0 5 4.5v11A1.5 1.5 0 0 0 6.5 17h7A1.5 1.5 0 0 0 15 15.5V6z M12 3v3.5h3',
    clock: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M10 7v3.3l2.2 1.4',
    sparkle: 'M10 3.5l1.7 4.3 4.3 1.7-4.3 1.7L10 15.5l-1.7-4.3L4 9.5l4.3-1.7z',
    search: 'M9 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M12.4 12.4L16 16',
    chevron: 'M7.5 5.5L12 10l-4.5 4.5',
    up: 'M10 15V5 M5.5 9.5L10 5l4.5 4.5',
    folderPlus: 'M3 7A1.5 1.5 0 0 1 4.5 5.5h3.8l1.5 1.7h5.2A1.5 1.5 0 0 1 16.5 8.7v6.3A1.5 1.5 0 0 1 15 16.5H4.5A1.5 1.5 0 0 1 3 15z M9.8 10.2v3.6 M8 12h3.6',
    upload: 'M10 14V5 M6 8.5L10 4.5l4 4 M4.5 15.5h11',
    close: 'M5.5 5.5l9 9 M14.5 5.5l-9 9'
  }

  function panelIcon(name, size) {
    const path = PANEL_GLYPHS[name] || PANEL_GLYPHS.file
    const dimension = typeof size === 'number' ? size : 16
    return h(
      'svg',
      {
        width: dimension,
        height: dimension,
        viewBox: '0 0 20 20',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
      },
      // 多段路径用 ' M' 连起来写，这里按段切开（每段都以 M 开头）。
      path
        .split(' M')
        .map((segment, index) => h('path', { key: `p${index}`, d: index === 0 ? segment : `M${segment}` }))
    )
  }

  async function panelApi(path, init) {
    const response = await fetch(`${ROUTE}${path}`, init)
    const raw = await response.text()
    let parsed = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    if (!response.ok) {
      const error = new Error(parsed?.error ? `${parsed.error}` : `HTTP ${response.status}`)
      error.status = response.status
      throw error
    }
    return parsed
  }

  const panelJson = (body) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

  /** 走 webkitGetAsEntry（拖整个目录进来还能拿到层次）；拿不到就退回平铺的 fileList。 */
  function entryFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject))
  }

  function readAllEntries(reader) {
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
  }

  async function walkEntry(entry, prefix, out) {
    if (!entry) return
    if (entry.isFile) {
      try {
        const file = await entryFile(entry)
        out.push({ file, rel: `${prefix}${file.name}` })
      } catch {
        /* 单个文件读不到（权限/被占用）就跳过，别把整次导入搞挂 */
      }
      return
    }
    if (entry.isDirectory) {
      const reader = entry.createReader()
      for (;;) {
        let batch = []
        try {
          batch = await readAllEntries(reader)
        } catch {
          break
        }
        if (!batch || batch.length === 0) break
        for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, out)
      }
    }
  }

  function makePanel({ useState, useEffect, useCallback, useRef, language, jumpToSession, openDocument }) {
    const dict = language === 'en' ? PANEL_EN : PANEL_ZH
    const t = (key, ...args) => {
      const value = dict[key]
      if (typeof value === 'function') return value(...args)
      return value === undefined ? key : value
    }

    // 回收站保留天数由宿主返回；这里留个兜底，避免面板和宿主的数字对不上。
    let trashTtlDays = 30

    return function LocalLibraryPanel() {
      const [tab, setTab] = useState('all')
      const [folderId, setFolderId] = useState('')
      const [tree, setTree] = useState(null)
      const [recent, setRecent] = useState(null)
      const [work, setWork] = useState(null)
      const [query, setQuery] = useState('')
      const [hits, setHits] = useState(null)
      const [expanded, setExpanded] = useState([''])
      const [preview, setPreview] = useState(null)
      const [editing, setEditing] = useState(null)
      const [editValue, setEditValue] = useState('')
      const [creating, setCreating] = useState(null)
      const [dragOverFolder, setDragOverFolder] = useState('')
      const [draggingIds, setDraggingIds] = useState([])
      const [fileOver, setFileOver] = useState(false)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState('')
      const [pending, setPending] = useState([])
      const [previewLoading, setPreviewLoading] = useState(false)
      const [selected, setSelected] = useState([])
      const [anchorId, setAnchorId] = useState(null)
      const [moveMenu, setMoveMenu] = useState(false)
      const [batchDraft, setBatchDraft] = useState(null)
      const [trash, setTrash] = useState(null)
      const fileInput = useRef(null)
      const dirInput = useRef(null)
      const noticeTimer = useRef(undefined)

      const toast = useCallback((text, isError) => {
        setNotice({ text, isError: Boolean(isError) })
        if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(null), 3600)
      }, [])

      useEffect(
        () => () => {
          if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
        },
        []
      )

      const loadTree = useCallback(async () => {
        const data = await panelApi('/tree')
        setTree(data)
        return data
      }, [])

      const loadRecent = useCallback(async () => {
        const data = await panelApi('/recent?limit=80')
        setRecent(data.items || [])
      }, [])

      const loadWork = useCallback(async () => {
        const data = await panelApi('/workfiles?limit=120')
        setWork(data)
      }, [])

      const loadTrash = useCallback(async () => {
        const data = await panelApi('/trash')
        if (typeof data.ttlDays === 'number' && data.ttlDays > 0) trashTtlDays = data.ttlDays
        setTrash(data.items || [])
      }, [])

      const refresh = useCallback(
        async (silent) => {
          if (!silent) setBusy('load')
          try {
            if (tab === 'all') await loadTree()
            else if (tab === 'recent') await loadRecent()
            else if (tab === 'trash') await loadTrash()
            else await loadWork()
          } catch (error) {
            toast(t('loadFailed', String(error?.message || error)), true)
          } finally {
            setBusy('')
          }
        },
        [tab, loadTree, loadRecent, loadWork, loadTrash, toast]
      )

      useEffect(() => {
        refresh()
      }, [refresh])

      // 检索：防抖 250ms，走 /list?q= 复用宿主侧那套中文两字组合匹配。
      useEffect(() => {
        const text = query.trim()
        if (text === '') {
          setHits(null)
          return undefined
        }
        let cancelled = false
        const timer = setTimeout(async () => {
          try {
            const data = await panelApi(`/list?q=${encodeURIComponent(text)}&limit=80`)
            if (!cancelled) setHits(data.items || [])
          } catch (error) {
            if (!cancelled) toast(t('loadFailed', String(error?.message || error)), true)
          }
        }, 250)
        return () => {
          cancelled = true
          clearTimeout(timer)
        }
      }, [query, toast])

      const trashCount = (trash || []).length
      const folders = (tree?.folders || []).slice()
      const items = (tree?.items || []).slice()
      const folderMap = {}
      for (const folder of folders) folderMap[folder.id] = folder
      const childrenOf = (parentId) =>
        folders.filter((folder) => (folder.parentId || '') === parentId).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      const itemsIn = (id) =>
        items
          .filter((item) => (item.folderId || '') === id)
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const folderTrail = []
      {
        let cursor = folderId ? folderMap[folderId] : undefined
        const seen = new Set()
        while (cursor && !seen.has(cursor.id)) {
          seen.add(cursor.id)
          folderTrail.unshift(cursor)
          cursor = cursor.parentId ? folderMap[cursor.parentId] : undefined
        }
      }

      const startEdit = (kind, id, field, value) => {
        setEditing({ kind, id, field })
        setEditValue(String(value || ''))
      }

      const commitEdit = async () => {
        if (editing === null) return
        const value = editValue
        const { kind, id, field } = editing
        setEditing(null)
        try {
          if (kind === 'folder') {
            await panelApi(`/folder?id=${encodeURIComponent(id)}`, {
              ...panelJson({ [field]: value }),
              method: 'PATCH'
            })
          } else {
            await panelApi(`/item?id=${encodeURIComponent(id)}`, {
              ...panelJson({ [field]: value }),
              method: 'PATCH'
            })
          }
          toast(t('saved'))
          await refresh(true)
          if (preview && preview.item.id === id) setPreview(null)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const createFolder = async () => {
        const name = String(creating?.name || '').trim()
        setCreating(null)
        if (name === '') return
        try {
          const data = await panelApi('/folder', panelJson({ name, parentId: creating.parentId || '' }))
          setExpanded((current) =>
            current.includes(creating.parentId || '') ? current : [...current, creating.parentId || '']
          )
          toast(`${t('newFolder')}：${data.folder?.name || name}`)
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const removeItem = async (item) => {
        if (!window.confirm(t('confirmRemoveFile', item.name))) return
        try {
          await panelApi(`/item?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
          if (preview && preview.item.id === item.id) setPreview(null)
          toast(t('removed', 1))
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const removeFolder = async (folder) => {
        const hasContent = items.some((item) => item.folderId === folder.id) || folders.some((f) => f.parentId === folder.id)
        const deep = hasContent ? window.confirm(t('confirmRemoveFolderDeep', folder.name)) : false
        if (!window.confirm(deep ? t('confirmRemoveFolderDeep', folder.name) : t('confirmRemoveFolder', folder.name))) return
        try {
          await panelApi(`/folder?id=${encodeURIComponent(folder.id)}&recursive=${deep ? '1' : '0'}`, { method: 'DELETE' })
          if (folderId === folder.id) setFolderId(folder.parentId || '')
          toast(t('removed', 1))
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const moveItemsTo = async (ids, target) => {
        if (ids.length === 0) return
        try {
          const data = await panelApi('/move', panelJson({ ids, folderId: target }))
          toast(t('moved', data.moved?.length || ids.length))
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const downloadItem = (item) => {
        // 走一个隐藏的 <a download>：接口本身带 content-disposition，新开标签页只会闪一下。
        const link = document.createElement('a')
        link.href = `${ROUTE}/download?id=${encodeURIComponent(item.id)}`
        link.download = item.name || ''
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
      }

      const openPreview = async (item) => {
        setPreviewLoading(true)
        setPreview({ item, text: '', total: 0 })
        try {
          const data = await panelApi(`/preview?id=${encodeURIComponent(item.id)}&maxChars=12000`)
          setPreview({ item: data.item || item, text: data.text || '', total: data.total || 0 })
          // 打开过就算访问过（服务端已记时间）；「最近访问」列表下次进入时自然是最新的。
          if (tab === 'recent') setRecent(null)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        } finally {
          setPreviewLoading(false)
        }
      }

      const uploadOne = (file, relPath, targetFolder) => {
        return new Promise((resolve, reject) => {
          const params = new URLSearchParams({ name: file.name, dup: 'keep' })
          // path 和 folder 要一起给：宿主把 path 的父级目录逐级建在 folder 里面，
          // 于是「拖进某个文件夹的整个目录」落点和用户拖的位置一致。
          if (relPath) params.set('path', relPath)
          if (targetFolder) params.set('folder', targetFolder)
          const id = `${file.name}-${Math.random().toString(36).slice(2, 8)}`
          setPending((current) => [...current, { id, name: relPath || file.name, pct: 0 }])
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${ROUTE}/upload?${params.toString()}`)
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return
            const pct = Math.round((event.loaded / event.total) * 100)
            setPending((current) => current.map((row) => (row.id === id ? { ...row, pct } : row)))
          }
          xhr.onload = () => {
            setPending((current) => current.filter((row) => row.id !== id))
            if (xhr.status >= 200 && xhr.status < 300) resolve(true)
            else reject(new Error(`HTTP ${xhr.status}`))
          }
          xhr.onerror = () => {
            setPending((current) => current.filter((row) => row.id !== id))
            reject(new Error('network'))
          }
          xhr.send(file)
        })
      }

      const uploadMany = async (list, targetFolder) => {
        if (list.length === 0) return
        let done = 0
        for (const row of list) {
          // 带相对路径的（拖进来的目录、"上传文件夹"）把整条相对路径交给宿主，
          // 它按 '论文/2026/xxx.pdf' 的父级逐级建目录，于是库里的层次和磁盘上一致。
          const rel = row.rel && row.rel.includes('/') ? row.rel : ''
          try {
            await uploadOne(row.file, rel, targetFolder)
            done += 1
          } catch (error) {
            toast(t('uploadFailed', row.rel || row.file.name), true)
          }
        }
        if (done > 0) toast(t('uploaded', done))
        await refresh(true)
      }

      const onDropNative = async (event) => {
        event.preventDefault()
        setFileOver(false)
        setDragOverFolder('')
        const transfer = event.dataTransfer
        if (!transfer) return
        const internal = transfer.getData(DRAG_ITEMS)
        if (internal) return
        const collected = []
        const entries = []
        if (transfer.items && transfer.items.length > 0) {
          for (const entry of Array.from(transfer.items)) {
            if (typeof entry.webkitGetAsEntry === 'function') {
              const node = entry.webkitGetAsEntry()
              if (node) entries.push(node)
            }
          }
        }
        if (entries.length > 0) {
          for (const node of entries) await walkEntry(node, '', collected)
        } else if (transfer.files && transfer.files.length > 0) {
          for (const file of Array.from(transfer.files)) collected.push({ file, rel: file.name })
        }
        await uploadMany(collected, folderId)
      }

      const onFolderDragOver = (event, id) => {
        if (!Array.from(event.dataTransfer?.types || []).includes(DRAG_ITEMS)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDragOverFolder(id)
      }

      const onFolderDrop = async (event, id) => {
        event.preventDefault()
        event.stopPropagation()
        setDragOverFolder('')
        const raw = event.dataTransfer?.getData(DRAG_ITEMS) || ''
        if (!raw) return
        let ids = []
        try {
          ids = JSON.parse(raw)
        } catch {
          ids = []
        }
        await moveItemsTo(ids, id)
      }

      const onRowDragStart = (event, item) => {
        const ids = [item.id]
        setDraggingIds(ids)
        event.dataTransfer.setData(DRAG_ITEMS, JSON.stringify(ids))
        event.dataTransfer.effectAllowed = 'move'
      }

      const jump = (sessionId) => {
        if (!sessionId || typeof jumpToSession !== 'function') {
          toast(t('locateFailed'), true)
          return
        }
        const ok = jumpToSession(sessionId)
        toast(ok === false ? t('locateFailed') : t('located'), ok === false)
      }

      const renderInlineEditor = (placeholder, onDone, extra) =>
        h('div', { className: 'llp-editrow' }, [
          h('input', {
            key: 'input',
            className: 'llp-input',
            value: editValue,
            placeholder,
            autoFocus: true,
            onChange: (event) => setEditValue(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') onDone()
              else if (event.key === 'Escape') setEditing(null)
            },
            onBlur: () => onDone()
          }),
          extra || null
        ])

      const renderTree = (parentId, depth) =>
        childrenOf(parentId).map((folder) => {
          const open = expanded.includes(folder.id)
          const childFolders = childrenOf(folder.id)
          const hasChildren = childFolders.length > 0
          return h('div', { key: folder.id }, [
            h(
              'button',
              {
                key: 'row',
                className: `llp-folder${folderId === folder.id && tab === 'all' ? ' on' : ''}${
                  dragOverFolder === folder.id ? ' over' : ''
                }`,
                style: { paddingLeft: `${6 + depth * 12}px` },
                onClick: () => {
                  setTab('all')
                  setFolderId(folder.id)
                  setQuery('')
                  setExpanded((current) => (current.includes(folder.id) ? current : [...current, folder.id]))
                },
                onDragOver: (event) => onFolderDragOver(event, folder.id),
                onDragLeave: () => setDragOverFolder(''),
                onDrop: (event) => onFolderDrop(event, folder.id),
                title: folder.path
              },
              [
                h(
                  'span',
                  {
                    key: 'twisty',
                    className: `llp-twisty${hasChildren ? '' : ' spacer'}`,
                    onClick: (event) => {
                      event.stopPropagation()
                      setExpanded((current) =>
                        current.includes(folder.id) ? current.filter((id) => id !== folder.id) : [...current, folder.id]
                      )
                    }
                  },
                  h('span', { style: { display: 'flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' } }, panelIcon('chevron', 12))
                ),
                h('span', { key: 'icon', style: { opacity: 0.75, display: 'flex' } }, panelIcon('folder', 15)),
                h('span', { key: 'name', className: 'llp-fname' }, folder.name),
                folder.remark ? h('span', { key: 'dot', className: 'llp-chip', title: folder.remark }, '备注') : null
              ]
            ),
            folder.remark && open && folder.remark !== ''
              ? h('div', { key: 'remark', className: 'llp-hint', style: { paddingLeft: `${28 + depth * 12}px` } }, folder.remark)
              : null,
            ...(open ? renderTree(folder.id, depth + 1) : [])
          ])
        })

      const currentIds = () => {
        if (query.trim()) return (hits || []).map((row) => row.id)
        if (tab === 'recent') return (recent || []).map((row) => row.id)
        if (tab === 'trash') return (trash || []).map((row) => row.id)
        if (tab === 'work') return []
        return itemsIn(folderId).map((row) => row.id)
      }

      const toggleSelect = (item, event) => {
        const ids = currentIds()
        if (event && event.shiftKey && anchorId && anchorId !== item.id) {
          const from = ids.indexOf(anchorId)
          const to = ids.indexOf(item.id)
          if (from >= 0 && to >= 0) {
            const [a, b] = from < to ? [from, to] : [to, from]
            const range = ids.slice(a, b + 1)
            setSelected((current) => Array.from(new Set([...current, ...range])))
            return
          }
        }
        setAnchorId(item.id)
        setSelected((current) =>
          current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
        )
      }

      const clearSelection = () => {
        setSelected([])
        setAnchorId(null)
        setMoveMenu(false)
        setBatchDraft(null)
      }

      const runBatchMove = async (target) => {
        const ids = selected.slice()
        setMoveMenu(false)
        clearSelection()
        await moveItemsTo(ids, target)
      }

      const runBatchDelete = async () => {
        const ids = selected.slice()
        if (ids.length === 0) return
        if (!window.confirm(t('confirmRemoveMany', ids.length))) return
        try {
          const data = await panelApi('/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          toast(t('removed', data.removed || 0))
          if (preview && ids.includes(preview.item.id)) setPreview(null)
          clearSelection()
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const restoreIds = async (ids) => {
        if (!ids.length) return
        try {
          const data = await panelApi('/restore', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          toast(t('restoreN', (data.restored || []).length))
          clearSelection()
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const purgeIds = async (ids) => {
        if (!ids.length) return
        if (!window.confirm(t('confirmPurge', ids.length))) return
        try {
          const data = await panelApi('/purge', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          toast(t('purgeN', (data.purged || []).length))
          if (preview && ids.includes(preview.item.id)) setPreview(null)
          clearSelection()
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const emptyTrashAction = async () => {
        if (!window.confirm(t('confirmEmptyTrash'))) return
        try {
          const data = await panelApi('/trash/empty', { method: 'POST' })
          toast(t('purgeN', data.purged || 0))
          setPreview(null)
          clearSelection()
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const runBatchDownload = async () => {
        const ids = selected.slice()
        if (ids.length === 0) return
        try {
          const response = await fetch(`${ROUTE}/bundle`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `library-${new Date().toISOString().slice(0, 10)}.zip`
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      const applyBatchRemark = async () => {
        const ids = selected.slice()
        const value = String(batchDraft || '').trim()
        if (ids.length === 0 || value === '') return
        try {
          const data = await panelApi('/remark', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids, remark: value, mode: 'append' })
          })
          toast(t('remarkSaved', data.updated || 0))
          clearSelection()
          await refresh(true)
        } catch (error) {
          toast(t('loadFailed', String(error?.message || error)), true)
        }
      }

      /**
       * 点文件：交给 DSH 自带的文档面板（markdown / PDF / 图片 / Office / 代码都认得），
       * 拿不到那个服务（旧版 DSH）就退回面板里的只读预览。
       */
      const openItem = (item) => {
        let pending = null
        try {
          if (typeof openDocument === 'function') pending = openDocument(item)
        } catch (error) {
          console.warn('[DSH-library] 打开文档面板失败：', error)
        }
        if (!pending || typeof pending.then !== 'function') {
          openPreview(item)
          return
        }
        pending.then(
          (opened) => {
            if (!opened) openPreview(item)
          },
          () => openPreview(item)
        )
      }

      const renderBatchBar = () => {
        if (tab === 'trash') {
          return h('div', { key: 'batchbar', className: 'llp-batch' }, [
            h('span', { key: 'n', className: 'llp-batchcount' }, t('selectedN', selected.length)),
            h('button', { key: 'all', className: 'llp-mini', onClick: () => setSelected(currentIds()) }, t('selectAll')),
            h('button', { key: 'rs', className: 'llp-mini main', onClick: () => restoreIds(selected.slice()) }, t('batchRestore', selected.length)),
            h('button', { key: 'pg', className: 'llp-mini danger', onClick: () => purgeIds(selected.slice()) }, t('batchPurge', selected.length)),
            h('button', { key: 'cl', className: 'llp-mini', onClick: clearSelection }, t('clearSel'))
          ])
        }
        const flat = folders.filter((folder) => folder && folder.id)
        return h('div', { key: 'batchbar', className: 'llp-batch' }, [
          h('span', { key: 'n', className: 'llp-batchcount' }, t('selectedN', selected.length)),
          h('button', { key: 'all', className: 'llp-mini', onClick: () => setSelected(currentIds()) }, t('selectAll')),
          h(
            'button',
            {
              key: 'mv',
              className: 'llp-mini',
              onClick: () => {
                setBatchDraft(null)
                setMoveMenu((value) => !value)
              }
            },
            t('batchMove')
          ),
          h(
            'button',
            {
              key: 'rmk',
              className: 'llp-mini',
              onClick: () => {
                setMoveMenu(false)
                setBatchDraft(batchDraft === null ? '' : null)
              }
            },
            t('batchRemark')
          ),
          h('button', { key: 'zip', className: 'llp-mini', onClick: runBatchDownload }, t('batchDownload')),
          h('button', { key: 'del', className: 'llp-mini danger', onClick: runBatchDelete }, t('batchDelete', selected.length)),
          h('button', { key: 'cl', className: 'llp-mini', onClick: clearSelection }, t('clearSel')),
          moveMenu
            ? h('div', { key: 'menu', className: 'llp-movemenu' }, [
                h('button', { key: 'root', className: 'llp-moveopt', onClick: () => runBatchMove('') }, t('toRoot')),
                ...flat.map((folder) =>
                  h(
                    'button',
                    { key: folder.id, className: 'llp-moveopt', onClick: () => runBatchMove(folder.id) },
                    folder.path ? `${folder.path}` : folder.name
                  )
                )
              ])
            : null,
          batchDraft === null
            ? null
            : h('div', { key: 'rmkbox', className: 'llp-batchremark' }, [
                h('div', { key: 'hint', className: 'llp-hint' }, t('remarkAppendHint')),
                h('textarea', {
                  key: 'ta',
                  className: 'llp-input',
                  rows: 2,
                  value: batchDraft,
                  onChange: (event) => setBatchDraft(event.target.value)
                }),
                h('button', { key: 'go', className: 'llp-mini main', onClick: applyBatchRemark }, t('applyRemark'))
              ])
        ])
      }

      const renderItemRow = (item) => {
        const isEditingName = editing && editing.kind === 'item' && editing.id === item.id && editing.field === 'name'
        const isEditingRemark = editing && editing.kind === 'item' && editing.id === item.id && editing.field === 'remark'
        return h('div', { key: item.id }, [
          h(
            'div',
            {
              key: 'row',
              className: `llp-row${preview && preview.item.id === item.id ? ' on' : ''}`,
              draggable: !isEditingName && !isEditingRemark,
              onDragStart: (event) => onRowDragStart(event, item),
              onDragEnd: () => setDraggingIds([]),
              onClick: () => openItem(item)
            },
            [
              h('span', { key: 'sel', className: 'llp-check' }, [
                h('input', {
                  key: 'c',
                  type: 'checkbox',
                  checked: selected.includes(item.id),
                  'aria-label': t('selectAll'),
                  onClick: (event) => {
                    event.stopPropagation()
                    toggleSelect(item, event)
                  },
                  onChange: () => {}
                })
              ]),
              h('div', { key: 'icon', className: 'llp-ico' }, panelIcon('file', 15)),
              h('div', { key: 'main', className: 'llp-rowmain' }, [
                h('div', { key: 'name', className: 'llp-rowname', title: item.name }, item.name),
                h('div', { key: 'meta', className: 'llp-rowmeta' }, [
                  h('span', { key: 'k', className: 'llp-kind' }, item.kind || 'file'),
                  h('span', { key: 's' }, formatBytes(item.size)),
                  item.folderPath ? h('span', { key: 'p' }, item.folderPath) : null,
                  item.addedBy === 'agent' ? h('span', { key: 'a', className: 'llp-chip blue' }, t('agentSaved')) : null,
                  item.lastAccessAt ? h('span', { key: 'l', className: 'llp-chip' }, t('accessCount', item.accessCount || 1)) : null
                ]),
                item.remark ? h('div', { key: 'remark', className: 'llp-remarkline' }, item.remark) : null
              ]),
              h('div', { key: 'act', className: 'llp-rowact' }, [
                h(
                  'button',
                  {
                    key: 'rename',
                    className: 'llp-mini',
                    onClick: (event) => {
                      event.stopPropagation()
                      startEdit('item', item.id, 'name', item.name)
                    }
                  },
                  t('rename')
                ),
                h(
                  'button',
                  {
                    key: 'remark',
                    className: 'llp-mini',
                    onClick: (event) => {
                      event.stopPropagation()
                      startEdit('item', item.id, 'remark', item.remark)
                    }
                  },
                  t('remark')
                ),
                h(
                  'button',
                  {
                    key: 'download',
                    className: 'llp-mini',
                    onClick: (event) => {
                      event.stopPropagation()
                      downloadItem(item)
                    }
                  },
                  t('download')
                ),
                item.trashedAt
                  ? h(
                      'button',
                      {
                        key: 'restore',
                        className: 'llp-mini main',
                        onClick: (event) => {
                          event.stopPropagation()
                          restoreIds([item.id])
                        }
                      },
                      t('restore')
                    )
                  : null,
                item.trashedAt
                  ? h(
                      'button',
                      {
                        key: 'purge',
                        className: 'llp-mini danger',
                        onClick: (event) => {
                          event.stopPropagation()
                          purgeIds([item.id])
                        }
                      },
                      t('purge')
                    )
                  : h(
                      'button',
                      {
                        key: 'remove',
                        className: 'llp-mini danger',
                        onClick: (event) => {
                          event.stopPropagation()
                          removeItem(item)
                        }
                      },
                      t('remove')
                    )
              ])
            ]
          ),
          isEditingName
            ? renderInlineEditor(item.name, commitEdit)
            : isEditingRemark
              ? renderInlineEditor(t('remarkPlaceholder'), commitEdit)
              : null
        ])
      }

      const renderAllFiles = () => {
        const current = itemsIn(folderId)
        const subFolders = childrenOf(folderId)
        return [
          subFolders.length > 0
            ? h(
                'div',
                { key: 'folders' },
                subFolders.map((folder) =>
                  h(
                    'div',
                    {
                      key: folder.id,
                      className: 'llp-row',
                      onDragOver: (event) => onFolderDragOver(event, folder.id),
                      onDragLeave: () => setDragOverFolder(''),
                      onDrop: (event) => onFolderDrop(event, folder.id),
                      onClick: () => {
                        setFolderId(folder.id)
                        setExpanded((value) => (value.includes(folder.id) ? value : [...value, folder.id]))
                      }
                    },
                    [
                      h('div', { key: 'i', className: 'llp-ico' }, panelIcon('folder', 15)),
                      h('div', { key: 'm', className: 'llp-rowmain' }, [
                        h('div', { key: 'n', className: 'llp-rowname', title: folder.name }, folder.name),
                        h('div', { key: 'x', className: 'llp-rowmeta' }, [
                          h('span', { key: 'c' }, t('files', itemsIn(folder.id).length))
                        ]),
                        folder.remark ? h('div', { key: 'r', className: 'llp-remarkline' }, folder.remark) : null
                      ]),
                      editing && editing.kind === 'folder' && editing.id === folder.id
                        ? null
                        : h('div', { key: 'a', className: 'llp-rowact' }, [
                            h(
                              'button',
                              {
                                key: 'rn',
                                className: 'llp-mini',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  startEdit('folder', folder.id, 'name', folder.name)
                                }
                              },
                              t('rename')
                            ),
                            h(
                              'button',
                              {
                                key: 'rm',
                                className: 'llp-mini',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  startEdit('folder', folder.id, 'remark', folder.remark)
                                }
                              },
                              t('remark')
                            ),
                            h(
                              'button',
                              {
                                key: 'del',
                                className: 'llp-mini danger',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  removeFolder(folder)
                                }
                              },
                              t('remove')
                            )
                          ])
                    ]
                  )
                )
              )
            : null,
          editing && editing.kind === 'folder'
            ? h('div', { key: 'editfolder' }, [
                h('div', { key: 'hint', className: 'llp-hint' }, `${t('rename')} · ${t('remark')}`),
                renderInlineEditor(editing.field === 'remark' ? t('remarkPlaceholder') : t('folderNamePlaceholder'), commitEdit)
              ])
            : null,
          current.length > 0
            ? h('div', { key: 'files' }, current.map(renderItemRow))
            : h('div', { key: 'empty', className: 'llp-empty' }, folderId ? t('emptyFolder') : t('emptyRoot')),
          creating
            ? h('div', { key: 'newfolder' }, [
                h(
                  'div',
                  { key: 'input', className: 'llp-editrow' },
                  h('input', {
                    className: 'llp-input',
                    placeholder: t('folderNamePlaceholder'),
                    autoFocus: true,
                    value: creating.name,
                    onChange: (event) => setCreating({ ...creating, name: event.target.value }),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') createFolder()
                      else if (event.key === 'Escape') setCreating(null)
                    },
                    onBlur: () => createFolder()
                  })
                )
              ])
            : null
        ]
      }

      const renderSearch = () => {
        const list = hits || []
        if (list.length === 0) return h('div', { className: 'llp-empty' }, t('emptySearch'))
        return h('div', null, list.map(renderItemRow))
      }

      const renderTrash = () => {
        const list = trash || []
        if (list.length === 0) return h('div', { className: 'llp-empty' }, t('trashEmpty'))
        return h('div', null, [
          h('div', { key: 'hint', className: 'llp-hint' }, t('trashHint', trashTtlDays)),
          h(
            'div',
            { key: 'act', className: 'llp-batch' },
            [
              h('span', { key: 'n', className: 'llp-batchcount' }, t('trashCount', list.length)),
              h('button', { key: 'empty', className: 'llp-mini danger', onClick: emptyTrashAction }, t('trashEmptyAction'))
            ]
          ),
          ...list.map(renderItemRow)
        ])
      }

      const renderRecent = () => {
        const list = recent || []
        if (list.length === 0) return h('div', { className: 'llp-empty' }, t('emptyRecent'))
        return h('div', null, list.map(renderItemRow))
      }

      const renderWork = () => {
        if (work === null) return h('div', { className: 'llp-empty' }, t('loading'))
        const files = work.files || []
        if (files.length === 0) return h('div', { className: 'llp-empty' }, t('emptyWork'))
        // 按会话分组：同一个会话产出的东西放在一起，右上角就是「定位到聊天」。
        const groups = []
        const index = {}
        for (const file of files) {
          if (index[file.sessionId] === undefined) {
            index[file.sessionId] = groups.length
            groups.push({ sessionId: file.sessionId, title: file.sessionTitle, cwd: file.cwd, rows: [] })
          }
          groups[index[file.sessionId]].rows.push(file)
        }
        return h(
          'div',
          null,
          groups.map((group) =>
            h('div', { key: group.sessionId }, [
              h('div', { key: 'head', className: 'llp-grouphead' }, [
                h('span', { key: 't', className: 'llp-grouptitle', title: group.title || group.sessionId }, group.title || group.sessionId),
                h('span', { key: 'c', className: 'llp-grouptime' }, t('sessionFiles', group.rows.length)),
                h(
                  'button',
                  {
                    key: 'go',
                    className: 'llp-mini main',
                    onClick: () => jump(group.sessionId)
                  },
                  t('locate')
                )
              ]),
              h(
                'div',
                { key: 'rows' },
                group.rows.map((row) =>
                  h(
                    'div',
                    {
                      key: `${row.sessionId}-${row.path}`,
                      className: 'llp-row'
                    },
                    [
                      h('div', { key: 'i', className: 'llp-ico' }, panelIcon('sparkle', 15)),
                      h('div', { key: 'm', className: 'llp-rowmain' }, [
                        h('div', { key: 'n', className: 'llp-rowname', title: row.path }, row.name),
                        h('div', { key: 'meta', className: 'llp-rowmeta' }, [
                          h('span', { key: 'k', className: 'llp-chip blue' }, row.kind === 'deliverable' ? t('deliverable') : t('write')),
                          h('span', { key: 's' }, row.exists ? formatBytes(row.size) : t('missing')),
                          row.description ? h('span', { key: 'd', className: 'llp-hint' }, row.description) : null
                        ]),
                        h('div', { key: 'p', className: 'llp-hint', style: { wordBreak: 'break-all' } }, row.path)
                      ]),
                      h('div', { key: 'a', className: 'llp-rowact' }, [
                        h(
                          'button',
                          {
                            key: 'save',
                            className: 'llp-mini',
                            onClick: (event) => {
                              event.stopPropagation()
                              panelApi('/import-path', panelJson({ path: row.path }))
                                .then(() => {
                                  toast(t('saved'))
                                  setTab('all')
                                  setFolderId('')
                                  loadTree().catch(() => {})
                                })
                                .catch((error) => {
                                  toast(
                                    error.status === 400 && String(error.message).includes('duplicate')
                                      ? t('savedAlready')
                                      : t('loadFailed', String(error?.message || error)),
                                    error.status !== 400
                                  )
                                })
                            }
                          },
                          t('saveToLib')
                        ),
                        h(
                          'button',
                          {
                            key: 'go',
                            className: 'llp-mini',
                            onClick: (event) => {
                              event.stopPropagation()
                              jump(row.sessionId)
                            }
                          },
                          t('locate')
                        )
                      ])
                    ]
                  )
                )
              )
            ])
          )
        )
      }

      const renderPreview = () => {
        if (!preview) return null
        const item = preview.item
        return h('section', { key: 'preview', className: 'llp-preview' }, [
          h('div', { key: 'head', className: 'llp-pvhead' }, [
            h('div', { key: 'title', className: 'llp-pvtitle' }, item.name),
            h('div', { key: 'meta', className: 'llp-pvmeta' }, [
              h('span', { key: 'k' }, item.kind || 'file'),
              h('span', { key: 's' }, formatBytes(item.size)),
              item.folderPath ? h('span', { key: 'p' }, item.folderPath) : null,
              preview.total ? h('span', { key: 't' }, `${preview.total} chars`) : null
            ]),
            h('div', { key: 'act', className: 'llp-pvact' }, [
              h(
                'button',
                {
                  key: 'dl',
                  className: 'llp-mini',
                  onClick: () => downloadItem(item)
                },
                t('download')
              ),
              h(
                'button',
                {
                  key: 'rm',
                  className: 'llp-mini',
                  onClick: () => startEdit('item', item.id, 'remark', item.remark)
                },
                t('remark')
              ),
              h(
                'button',
                {
                  key: 'close',
                  className: 'llp-mini',
                  onClick: () => setPreview(null)
                },
                t('close')
              )
            ])
          ]),
          item.remark ? h('div', { key: 'remark', className: 'llp-pvremark' }, item.remark) : null,
          h(
            'div',
            { key: 'text', className: 'llp-pvtext' },
            previewLoading ? t('loading') : preview.text ? preview.text : t('noText')
          )
        ])
      }

      const breadcrumb = h('div', { key: 'crumb', className: 'llp-crumb' }, [
        h(
          'button',
          {
            key: 'root',
            className: `llp-crumbbtn${folderId === '' && tab === 'all' ? ' llp-crumbcur' : ''}`,
            onClick: () => {
              setTab('all')
              setFolderId('')
              setQuery('')
            },
            onDragOver: (event) => onFolderDragOver(event, ''),
            onDrop: (event) => onFolderDrop(event, '')
          },
          t('breadcrumbRoot')
        ),
        ...folderTrail.map((folder, order) =>
          h(
            'span',
            { key: folder.id, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
            [
              h('span', { key: 'sep', className: 'llp-sep' }, '/'),
              h(
                'button',
                {
                  key: 'b',
                  className: `llp-crumbbtn${order === folderTrail.length - 1 ? ' llp-crumbcur' : ''}`,
                  onClick: () => setFolderId(folder.id)
                },
                folder.name
              )
            ]
          )
        ),
        tab === 'recent' ? h('span', { key: 'recent', className: 'llp-crumbbtn llp-crumbcur' }, t('recent')) : null,
        tab === 'work' ? h('span', { key: 'work', className: 'llp-crumbbtn llp-crumbcur' }, t('work')) : null,
        tab === 'trash' ? h('span', { key: 'trash', className: 'llp-crumbbtn llp-crumbcur' }, t('trash')) : null
      ])

      const body = query.trim()
        ? renderSearch()
        : tab === 'recent'
          ? renderRecent()
          : tab === 'work'
            ? renderWork()
            : tab === 'trash'
              ? renderTrash()
              : renderAllFiles()

      return h('div', { className: 'llp-wrap' }, [
        h('div', { key: 'root', className: 'llp-root' }, [
          h('aside', { key: 'side', className: 'llp-side' }, [
            h('div', { key: 'head', className: 'llp-sidehead' }, t('panelTitle')),
            h(
              'button',
              {
                key: 'all',
                className: `llp-nav${tab === 'all' ? ' on' : ''}`,
                onClick: () => {
                  setTab('all')
                  setQuery('')
                }
              },
              [h('span', { key: 'i', className: 'llp-ico' }, panelIcon('folder', 15)), h('span', { key: 't' }, t('allFiles')), h('span', { key: 'n', className: 'llp-badge' }, String(items.length))]
            ),
            h(
              'button',
              {
                key: 'recent',
                className: `llp-nav${tab === 'recent' ? ' on' : ''}`,
                onClick: () => {
                  setTab('recent')
                  setQuery('')
                }
              },
              [h('span', { key: 'i', className: 'llp-ico' }, panelIcon('clock', 15)), h('span', { key: 't' }, t('recent'))]
            ),
            h(
              'button',
              {
                key: 'work',
                className: `llp-nav${tab === 'work' ? ' on' : ''}`,
                onClick: () => {
                  setTab('work')
                  setQuery('')
                }
              },
              [h('span', { key: 'i', className: 'llp-ico' }, panelIcon('sparkle', 15)), h('span', { key: 't' }, t('work'))]
            ),
            h(
              'button',
              {
                key: 'trash',
                className: `llp-nav${tab === 'trash' ? ' on' : ''}`,
                onClick: () => {
                  setTab('trash')
                  setQuery('')
                  clearSelection()
                }
              },
              [
                h('span', { key: 'i', className: 'llp-ico' }, panelIcon('folder', 15)),
                h('span', { key: 't' }, t('trash')),
                trashCount > 0 ? h('span', { key: 'n', className: 'llp-badge' }, String(trashCount)) : null
              ]
            ),
            h('div', { key: 'treelabel', className: 'llp-treelabel' }, t('folders', folders.length)),
            h(
              'div',
              {
                key: 'tree',
                className: 'llp-tree',
                onDragOver: (event) => onFolderDragOver(event, ''),
                onDragLeave: () => setDragOverFolder(''),
                onDrop: (event) => onFolderDrop(event, '')
              },
              [
                ...renderTree('', 0),
                h(
                  'button',
                  {
                    key: 'new',
                    className: 'llp-folder',
                    onClick: () => setCreating({ parentId: folderId, name: '' }),
                    style: { opacity: 0.8 }
                  },
                  [h('span', { key: 'i', className: 'llp-ico' }, panelIcon('folderPlus', 15)), h('span', { key: 't', className: 'llp-fname' }, t('newFolder'))]
                )
              ]
            )
          ]),
          h('main', { key: 'main', className: 'llp-main' }, [
            h('div', { key: 'top', className: 'llp-top' }, [
              breadcrumb,
              h('div', { key: 'tools', className: 'llp-tools' }, [
                h('div', { key: 'search', className: 'llp-search' }, [
                  h('span', { key: 'i', style: { opacity: 0.5, display: 'flex' } }, panelIcon('search', 14)),
                  h('input', {
                    key: 'in',
                    value: query,
                    placeholder: t('searchPlaceholder'),
                    onChange: (event) => setQuery(event.target.value)
                  })
                ]),
                h(
                  'button',
                  {
                    key: 'upload',
                    className: 'llp-mini main',
                    onClick: () => fileInput.current?.click()
                  },
                  t('uploadFile')
                ),
                h(
                  'button',
                  {
                    key: 'uploaddir',
                    className: 'llp-mini',
                    onClick: () => dirInput.current?.click()
                  },
                  t('uploadFolder')
                ),
                h(
                  'button',
                  {
                    key: 'newfolder',
                    className: 'llp-mini',
                    onClick: () => setCreating({ parentId: folderId, name: '' })
                  },
                  t('newFolder')
                ),
                h(
                  'button',
                  {
                    key: 'refresh',
                    className: 'llp-mini',
                    onClick: () => refresh(),
                    disabled: busy === 'load'
                  },
                  t('refresh')
                )
              ])
            ]),
            pending.length > 0
              ? h(
                  'div',
                  { key: 'pending', className: 'llp-hint', style: { padding: '6px 16px' } },
                  pending.map((row) => `${row.name} ${row.pct}%`).join('   ')
                )
              : null,
            selected.length > 0 ? renderBatchBar() : null,
            h(
              'div',
              {
                key: 'body',
                className: `llp-body${fileOver ? ' drop' : ''}`,
                onDragOver: (event) => {
                  if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
                    event.preventDefault()
                    setFileOver(true)
                    return
                  }
                  if (Array.from(event.dataTransfer?.types || []).includes(DRAG_ITEMS)) {
                    // 内部拖动落到空白处 = 移到当前文件夹
                    event.preventDefault()
                    setDragOverFolder('__body__')
                  }
                },
                onDragLeave: () => {
                  setFileOver(false)
                  setDragOverFolder('')
                },
                onDrop: async (event) => {
                  const internal = event.dataTransfer?.getData(DRAG_ITEMS)
                  if (internal) {
                    event.preventDefault()
                    setDragOverFolder('')
                    try {
                      await moveItemsTo(JSON.parse(internal), folderId)
                    } catch {
                      /* 片段不是我们的数据就当没发生 */
                    }
                    return
                  }
                  await onDropNative(event)
                },
                title: t('folderDepthHint')
              },
              body
            ),
            h('input', {
              key: 'fileinput',
              ref: fileInput,
              type: 'file',
              multiple: true,
              style: { display: 'none' },
              onChange: async (event) => {
                const list = Array.from(event.target.files || []).map((file) => ({ file, rel: '' }))
                event.target.value = ''
                await uploadMany(list, folderId)
              }
            }),
            h('input', {
              key: 'dirinput',
              ref: (node) => {
                dirInput.current = node
                if (node !== null) {
                  node.setAttribute('webkitdirectory', '')
                  node.setAttribute('directory', '')
                }
              },
              type: 'file',
              multiple: true,
              style: { display: 'none' },
              onChange: async (event) => {
                const list = Array.from(event.target.files || []).map((file) => ({
                  file,
                  rel: file.webkitRelativePath || file.name
                }))
                event.target.value = ''
                await uploadMany(list, folderId)
              }
            })
          ]),
          renderPreview()
        ]),
        notice ? h('div', { key: 'toast', className: `llp-toast${notice.isError ? ' err' : ''}` }, notice.text) : null
      ])
    }
  }

  /** 侧栏图标：DSH 只传 size，别的什么都别指望。 */
  function makeSidebarIcon() {
    return function LocalLibrarySidebarIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        [
          h('path', { key: 'a', d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h3.6l1.5 1.8h5.9A1.5 1.5 0 0 1 17 8.3v7.2A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5z' }),
          h('path', { key: 'b', d: 'M7 11h6 M7 13.6h4' })
        ]
      )
    }
  }

  function makeFactory() {
    return (require) => {
      const module = { exports: {} }
      const react = require('react')
      const { useState, useEffect, useCallback, useRef } = react
      // 用 React.createElement 而不是 react/jsx-runtime 的 jsx：
      // jsx(type, props, key) 第三个参数是 key，写成 h(type, props, child1, child2) 会把
      // 第一个孩子当成 key、其余孩子全部丢掉，而且 props 传 null 在 dev 构建里还会抛错。
      // createElement 才有 (type, props, ...children) 的语义，和下面所有调用点一致。
      // 也不能用 const 局部变量遮蔽：makeSettings 定义在 IIFE 作用域，要读外层这个 h。
      h = react.createElement
      if (typeof h !== 'function') throw new Error('DSH-library: react 没有导出 createElement')

      const name = 'local-library'
      const inject = ['slots', 'locale']

      function apply(ctx) {
        injectCss(typeof document === 'undefined' ? undefined : document)

        // 界面语言：只看浏览器语言，不走 locale 服务的 bind（它的返回契约随版本变，
        // 这里不能赌；字典仍然注册给 DSH，供别处误用不到也不影响本页）。
        const language =
          typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'zh'
        const dict = language === 'en' ? en : zh
        const t = (key, ...args) => {
          const value = dict[key]
          if (typeof value === 'function') return value(...args)
          return value !== undefined ? value : key
        }

        // 注册字典只是「免得别处复用接口时查不到」，失败绝不能连累设置分区本身。
        ctx.effect(() => {
          if (!ctx.locale || typeof ctx.locale.register !== 'function') return () => {}
          let dispose = undefined
          try {
            dispose = ctx.locale.register(NS, { zh, en })
          } catch (error) {
            console.warn('[DSH-library] locale.register failed:', error)
            return () => {}
          }
          return () => {
            try {
              if (typeof dispose === 'function') dispose()
            } catch {
              /* 语言包释放失败无副作用 */
            }
          }
        }, 'DSH-library: locale')

        // 会话跳转：uiWorkspace 是客户端服务。用 ctx.inject 拿，拿不到也不影响面板其余部分，
        // 只是「定位到聊天」会退化成一条提示。不写进 inject 数组，是为了不因为服务改名就让整个插件挂掉。
        let uiWorkspace
        try {
          if (typeof ctx.inject === "function") {
            ctx.inject(["uiWorkspace"], (services) => {
              uiWorkspace = services.uiWorkspace
            })
          }
        } catch (error) {
          console.warn("[DSH-library] uiWorkspace injection skipped:", error)
        }
        const clientService = (name, current) => {
          if (current) return current
          if (typeof ctx.get !== "function") return undefined
          try {
            return ctx.get(name)
          } catch {
            return undefined
          }
        }
        const jumpToSession = (sessionId) => {
          const service = clientService("uiWorkspace", uiWorkspace)
          if (!service || typeof service.openSession !== "function") return false
          try {
            service.openSession(String(sessionId))
            return true
          } catch (error) {
            console.warn("[DSH-library] openSession failed:", error)
            return false
          }
        }

        // ── DSH 自带的文档面板 ────────────────────────────────────────────
        // sidebarRight 是客户端服务（右侧标签栏的路由与标签都归它管），layout 用来把主区域
        // 从「本地资料库」切回对话：右侧标签栏只挂在对话上，主区域被全局面板占着时它没有会话。
        let sidebarRight
        let layoutService
        try {
          if (typeof ctx.inject === "function") {
            ctx.inject(["sidebarRight"], (services) => {
              sidebarRight = services.sidebarRight
            })
            ctx.inject(["layout"], (services) => {
              layoutService = services.layout
            })
          }
        } catch (error) {
          console.warn("[DSH-library] sidebarRight injection skipped:", error)
        }

        // dsh-resource://file/session/<sid>/<path>：逐段 encodeURIComponent，盘符的冒号保持字面。
        const addressSegment = (segment) => encodeURIComponent(String(segment)).replace(/%3A/gi, ":")
        const sessionFileAddress = (sessionId, path) => {
          const normalized = String(path || "").replace(/\\/g, "/").replace(/^(?:\.\/)+/, "")
          const encoded = normalized.split("/").map(addressSegment).join("/")
          return "dsh-resource://file/session/" + addressSegment(sessionId) + "/" + encoded
        }
        const mountedSessionId = (service) => {
          try {
            const value = service && service.mounted && service.mounted.getSnapshot ? service.mounted.getSnapshot() : ""
            return typeof value === "string" ? value : ""
          } catch {
            return ""
          }
        }

        /**
         * 交给 DSH 自带的文档预览标签页：markdown / 图片 / PDF / Office / 代码都由它挑渲染器。
         * 拿不到服务（旧版 DSH）或拿不到会话时返回 false，面板那边会退回自己的只读预览。
         */
        const openDocument = async (item) => {
          const id = String(item && item.id ? item.id : "")
          if (!id) return false
          const service = clientService("sidebarRight", sidebarRight)
          if (!service || typeof service.openResource !== "function") return false
          const layout = clientService("layout", layoutService)
          try {
            const snapshot = layout && layout.panelInfo && layout.panelInfo.getSnapshot ? layout.panelInfo.getSnapshot() : null
            if (snapshot && snapshot.activePanelId) layout.selectPanel(null)
          } catch (error) {
            console.warn("[DSH-library] selectPanel failed:", error)
          }
          let data
          try {
            data = await panelApi("/open-path?id=" + encodeURIComponent(id), { method: "POST" })
          } catch (error) {
            console.warn("[DSH-library] open-path failed:", error)
            return false
          }
          const target = String(data && data.path ? data.path : "")
          if (!target) return false
          // 切回对话之后右侧栏才认得出当前会话；面板刚切换时可能晚一帧，短暂重试。
          let sessionId = mountedSessionId(service)
          for (let attempt = 0; attempt < 6 && !sessionId; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 40))
            sessionId = mountedSessionId(service)
          }
          if (!sessionId) return false
          try {
            service.openResource(sessionFileAddress(sessionId, target))
            return true
          } catch (error) {
            console.warn("[DSH-library] openResource failed:", error)
            return false
          }
        }
        const Section = makeSettings({ useState, useEffect, useCallback, useRef, t })

        ctx.slots.inject('settings.section', function* () {
          yield ctx.slots.register(
            {
              name: 'settings.section',
              id: 'local-library',
              order: 35,
              label: () => t('nav'),
              inject: () => ({ t })
            },
            Section
          )
        })

        ctx.effect(() => {
          try {
            return installNavIcon(() => t('nav'))
          } catch (error) {
            // 图标只是锦上添花，DOM 结构和 DSH 版本相关，失败就沿用默认齿轮。
            console.warn('[DSH-library] nav icon skipped:', error)
            return () => {}
          }
        }, 'DSH-library: settings nav icon')

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
      }

      module.exports = { apply, inject, name }
      return module.exports
    }
  }

  window.__ModuleLoader__.load({ id: 'DSH-library', factory: makeFactory() })
})()
