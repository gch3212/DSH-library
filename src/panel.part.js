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
    confirmRemoveFile: (name) => `确定把「${name}」从资料库删除？（磁盘上的原文件不受影响）`,
    confirmRemoveFolder: (name) => `删除文件夹「${name}」？里面的文件会移到上一层，不会被删。`,
    confirmRemoveFolderDeep: (name) => `连同里面的文件一起删掉「${name}」及其子文件夹？这个操作不能撤销。`,
    removed: (n) => `已删除 ${n} 项`,
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
    parentFolder: '返回上一层'
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
    confirmRemoveFile: (name) => `Remove “${name}” from the library? (The file on disk is untouched.)`,
    confirmRemoveFolder: (name) => `Delete folder “${name}”? Files inside move up one level.`,
    confirmRemoveFolderDeep: (name) => `Delete “${name}” and everything inside? This cannot be undone.`,
    removed: (n) => `Removed ${n} item(s)`,
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
    parentFolder: 'Up one level'
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
      '.llp-rowname{font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
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
      '.llp-hint{font-size:11.5px;opacity:.45;padding:2px 8px}'
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

  function makePanel({ useState, useEffect, useCallback, useRef, language, jumpToSession }) {
    const dict = language === 'en' ? PANEL_EN : PANEL_ZH
    const t = (key, ...args) => {
      const value = dict[key]
      if (typeof value === 'function') return value(...args)
      return value === undefined ? key : value
    }

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

      const refresh = useCallback(
        async (silent) => {
          if (!silent) setBusy('load')
          try {
            if (tab === 'all') await loadTree()
            else if (tab === 'recent') await loadRecent()
            else await loadWork()
          } catch (error) {
            toast(t('loadFailed', String(error?.message || error)), true)
          } finally {
            setBusy('')
          }
        },
        [tab, loadTree, loadRecent, loadWork, toast]
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
              onClick: () => openPreview(item)
            },
            [
              h('div', { key: 'icon', className: 'llp-ico' }, panelIcon('file', 15)),
              h('div', { key: 'main', className: 'llp-rowmain' }, [
                h('div', { key: 'name', className: 'llp-rowname' }, item.name),
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
                h(
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
                        h('div', { key: 'n', className: 'llp-rowname' }, folder.name),
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
        tab === 'work' ? h('span', { key: 'work', className: 'llp-crumbbtn llp-crumbcur' }, t('work')) : null
      ])

      const body = query.trim()
        ? renderSearch()
        : tab === 'recent'
          ? renderRecent()
          : tab === 'work'
            ? renderWork()
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
