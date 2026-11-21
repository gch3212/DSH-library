# DSH Library · 本地资料库

<img src="assets/icon-180.png" width="96" height="96" alt="DSH Library">

中文 · [English](README.en.md) · [更新记录](CHANGELOG.md)

> **本仓库是 [Fucaplos/dsh-local-library](https://github.com/Fucaplos/dsh-local-library) 的改造版（0.5.x）**：在原版「跨会话共享的本地资料库」上加了一个**工作台首页侧边栏面板**，把库改造成**像资源管理器一样能建文件夹、改名、写备注**，支持**拖入整个目录树并保留层级**，并加了**最近访问**与**本地工作生成文件**两个视图（可以一键定位回产生它的那个对话）。原版的设计、抽取器、检索打分全部保留，`index.json` 从 v1 自动升级到 v2，老数据不丢。

给 DSH Desktop 用的**本地资料库**插件：一个跨会话共享的文件柜。文件留在本机，不上传任何云端；每个新对话都能通过四个工具（`library_list` / `library_search` / `library_read` / `library_save`）检索、读取、保存，模型自己会先来查。

## 功能

- **两个入口**：「设置 → 本地资料库」；以及**工作台首页侧栏的资料库图标**，点开是整页面板。
- **像资源管理器一样管文件**：文件夹树、新建 / 改名 / 删除文件夹、把文件拖进文件夹、面包屑导航、文件行内改名。
- **文件夹和文件都能写备注**：备注和文件夹路径跟文件名一样参与检索；模型读资料时能看到「位置 / 备注」。
- **拖入整个文件夹会保留层级**：`论文/2026/投稿/x.pdf` 原样落成三级文件夹，不是摊平。
- **最近访问**：按你真正读过 / 预览过的顺序排（模型调 `library_read` 也算一次访问）。
- **本地工作生成文件**：按会话分组列出每个对话交付过、或写过盘的文件，每行可以**定位到聊天**或**存入资料库**。
- **批量操作**：行前复选框 + Shift 区间选择；批量移动到文件夹、批量追加备注、打包下载成 zip、批量删除。
- **点文件就用 DSH 自带的文档面板打开**：markdown、图片、PDF、Office、代码都由 DSH 按扩展名挑渲染器，标题是你在库里给的名字。
- **删错了能捞回来**：删除只是移进回收站（文件原地不动），30 天内可以还原；回收站里能单条还原、单条彻底删除、或一键清空。超期在下次启动时自动清理。
- **每个新对话天然知道它存在**：插件往系统提示词里加一段说明，并注册 4 个工具，用户不必再说「我有一份资料」。
- **重复检测**：同样的内容再传一次会问「覆盖 / 再存一份 / 跳过」。
- **可检索正文**：`.md/.txt/.csv/.json/...`、`.docx`、`.xlsx`、`.pptx`、`.pdf` 抽成纯文本；PDF 优先用本机 PyMuPDF（中文更稳），失败回退零依赖流级抽取；配了视觉模型的话图片会被描述成文字参与检索。
- **文件只在本机**：存在 `$DSH_HOME\local-library`（默认 `%APPDATA%\dsh-desktop\harness\local-library`）。

## 侧边栏面板怎么用

工作台首页左栏多了一个资料库图标（排在「对话」下面一点），点开是整页面板：

- **左栏**：四个视图（全部文件 / 最近访问 / 工作生成文件 / 回收站）+ 文件夹树 + 「新建文件夹」。
- **全部文件**：面包屑在上方；文件夹行可展开、可拖入文件（把文件拖到文件夹上就移动过去）。根目录只列文件夹，进文件夹才看到文件——和资源管理器一个手感。每一行都能**改名 / 写备注 / 下载 / 删除**。
- **拖文件或整个文件夹进来**：拖到左侧空白处落在当前目录，拖到某个文件夹行上落在那个文件夹里；整个目录树的层级保留。有上传进度，重复内容会问你怎么处理。
- **备注**：文件夹和文件都能写一句人话（"导师给的那版"、"投稿用"）。备注参与检索，也会出现在模型的 `library_list` / `library_search` / `library_read` 结果里，和文件名同权重。
- **最近访问**：按 `lastAccessAt` 排，显示访问次数。
- **工作生成文件**：读本机会话日志（`deliverables/presented` 交付物 + `write`/`edit` 类工具写过盘的文件），按会话分组。每行两个按钮：**定位到聊天**（跳回原会话）、**存入资料库**（把磁盘上的文件收进库，之后每个对话都能检索到它）。
- **批量操作**：每行前面有复选框，选中后上方出现批量条——批量移动到文件夹、批量备注（追加）、打包下载成一个 zip、批量删除（有确认）。
- **回收站**：删除的文件先进回收站，侧栏第四个入口就是它，带待清理数量角标。里面能**还原 / 彻底删除 / 清空回收站**，每条显示还剩几天。磁盘文件在「彻底删除」之前一直保留。
- **打开文件**：点一行文件，面板会切回对话、在右侧栏用 DSH 自带的文档预览打开它——markdown 渲染、图片、PDF、Office、代码都按扩展名认；标题就是文件在库里显示的名字（宿主用硬链接给了一份同内容的临时路径）。右栏那个预览是 DSH 自己的，跟资源管理器里点开一个文件是一回事，不用在插件里再写一套。
- **只读说明**：资料库不改写文件内容。要改就点「下载」拿原件改完再上传（同名会问是否替换）。

## 安装

**前提**：DSH Desktop（Windows 上脚本用 junction 装，不需要管理员权限）、PowerShell 7。侧边栏面板用到 `main` / `sidebar.panellist` 槽位，需要较新的 DSH；更老的版本上面板入口不出现，设置页里的资料库照旧可用。

### 方式一：脚本（推荐）

```powershell
git clone https://github.com/gch3212/DSH-library.git
cd DSH-library
pwsh -File install.ps1
```

脚本会自己找 profile（依次试 `$DSH_HOME\profiles\desktop`、`$DSH_HOME\profiles\web`、`%APPDATA%\dsh-desktop\harness\profiles\*`、`~\.dsh\profiles\*`），找不到再显式传：

```powershell
pwsh -File install.ps1 -ProfileRoot 'D:\my-dsh\harness\profiles\desktop'
```

脚本只做三件事，改文件前都会先备份成 `*.bak-DSH-library-<时间戳>`：

1. **建 junction**：`profiles\<name>\node_modules\DSH-library` → 本仓库。DSH 靠包名解析插件，junction 让包名成立，同时代码留在工作区、改完重启即生效。
2. **登记到 `dsh.profile.bundles`**：把 `"DSH-library"` 加进 `profiles\<name>\package.json` 的 `dsh.profile.bundles` 数组——这是 DSH 加载插件的清单，插件自己的 `cordis.patch.yml`（`dsh.bundle.patch`）由 DSH 自动套用，**不需要**往 profile 的 `cordis.patch.yml` 写东西。旧版脚本插过条目的 profile 会被顺手清掉（同一个 id 注册两次会让加载器报错）。
3. **做一次包名解析自检**：`DSH-library` 与 `DSH-library/client` 都要能解析到，否则会缺半个插件。

脚本是幂等的，重复跑只打印“已存在/跳过”；不碰 `pnpm-lock.yaml`。

装完**重启 DSH Desktop**（宿主半侧在启动时加载），**再刷新页面 F5**（客户端半侧由启动清单投递）。设置里应出现「本地资料库」，首页侧栏应出现资料库图标。

卸载（数据默认保留，加 `-PurgeData` 才连文件一起删）：

```powershell
pwsh -File uninstall.ps1
pwsh -File uninstall.ps1 -PurgeData
```

### 方式二：tarball（不需要 git、不需要联网）

```powershell
git clone https://github.com/gch3212/DSH-library.git
cd DSH-library
pwsh -File scripts/install-tarball.ps1
```

脚本先 `pnpm pack` 出 `DSH-library-<版本>.tgz`（默认放在 `$DSH_HOME\plugin-dist`），再用 DSH 自带的 node + pnpm 把它 `add` 进 profile。装进去的是**真拷贝**，lockfile 里记的是 tarball 的 `file:` + `integrity`，全程不需要 `git`，也不需要访问 npm registry。

什么时候用它：

- 这台机器的 **DSH 启动的 pnpm 找不到 `git`**（这时市场按地址更新会报 `ERR_PNPM_GIT_FETCH_FAILED`）；
- 想要“市场装出来那种拷贝”，而不是指向工作区的链接。

代价：**改完代码要重跑一次脚本**（再重启 DSH），不像方式一那样重启即生效。脚本幂等，重复跑会用当前版本覆盖；它会先摘掉上一次留下的 junction，免得 pnpm 认为“已经是最新的”而不换。

### 方式三：交给插件市场

本仓库是标准 npm 包（`main` + `exports` + `dsh.bundle.patch` + `dsh.client`），在市场里按地址安装即可：

```
github:gch3212/DSH-library
```

这条路由 pnpm 从 GitHub 取包，所以对方机器上 **DSH 启动的 pnpm 必须能找到 `git`**（装 Git for Windows 并让 `git` 在 PATH 里即可）。代价是：更新=按仓库重装，**会覆盖本地改动**；要改代码请用方式一。

装好之后，插件管理里显示的包名是 `DSH-library`，版本 0.5.3。

**为什么改名**：上游那份在市场里叫 `dsh-local-library`，两个不同来源用同一个包名，市场里会撞成两行同样名字，`pnpm` 也会把它们当成同一个包互相替换。改叫 `DSH-library` 之后两者互不干扰。资料库的数据目录仍是 `$DSH_HOME\local-library`，**改名不需要迁移任何文件**。

### 方式四：手动

复制或链接本仓库到 `profiles\<name>\node_modules\DSH-library`，再把 `"DSH-library"` 加进 profile `package.json` 的 `dsh.profile.bundles`（更老的 DSH 版本则往 `cordis.patch.yml` 的 `- insert:` 里加 `- id: DSH-library` / `name: 'DSH-library'` 两行）。Linux / macOS 上用软链代替 junction。

### 装之前的两点注意

- **别和上游版同时装**：两个包名不同（`DSH-library` 与 `dsh-local-library`），技术上能并存，但没意义——它们注册同名的四个工具（`library_list` 等），也共用同一个数据目录 `$DSH_HOME\local-library`。装过上游版的，先把那个卸掉。
- **资料库数据不随插件走**：文件都在本机 `$DSH_HOME\local-library`，换装、重装、卸载（不加 `-PurgeData`）都不会动它们，也不会同步给别人。

## 装好之后长什么样

设置（左下角齿轮）→ 左栏「本地资料库」：

- 上方拖拽区（可拖文件夹，按顶层文件夹名记一笔标签），带上传进度；
- 搜索框 + 类型过滤 chips（全部 / PDF / Word / 表格 / PPT / 图片 / 文本），支持 `kind:`、`tag:`、`after:`、`before:` 过滤语法，右边有「严格匹配」开关；
- 列表每行：勾选框（多选后「打包下载」成 zip）、文件名与元信息、位置与备注、标签（行内编辑，逗号分隔）、命中片段、**下载**、**删除**（点两次确认）；
- 底部：文件数 / 占用量 / 已建索引数 / **重建索引** / 存储路径（可复制）。

对话里可以直接说「看看我资料库里关于 XX 的东西」；也可以什么都不说——只要请求看起来要用到用户自己的材料，模型会先来查一眼。

## 文件放在哪

```
$DSH_HOME\local-library\          # 默认 %APPDATA%\dsh-desktop\harness\local-library
├── index.json                    # 条目 + 文件夹 + 计数（v2；老 v1 启动时自动升级）
├── settings.json                 # 检索偏好（目前只有 matchMode）
├── files\<id><ext>               # 原文件
└── text\<id>.txt                 # 抽取出来的纯文本（检索用）
```

`index.json` 里每个条目：`id`（`ll-…`）、`name`、`ext`、`mime`、`size`、`sha256`、`kind`、`createdAt`、`updatedAt`、`addedBy`（`upload` / `agent`）、`tags[]`、`folderId`、`remark`、`lastAccessAt`、`accessCount`、`textChars`、`indexed`。文件夹：`id`（`lf-…`）、`name`、`parentId`、`remark`、`createdAt`、`updatedAt`。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半侧：HTTP 路由、4 个工具、系统提示词段、索引流水线 |
| `lib/store.js` | 存储与索引：`index.json` 原子写、文件夹树、中文 bigram 检索打分、正文缓存、sha256 去重、分段读 |
| `lib/sessions.js` | 读本机会话日志（zstd 分帧解压），给「最近访问 / 工作生成文件」提供会话归因 |
| `lib/client.js` | 客户端半侧（**生成产物**）：设置分区 + 侧边栏面板，`window.__ModuleLoader__` 载入 |
| `src/base-client.js` | 客户端源码：设置页那一半 |
| `src/panel.part.js` | 客户端源码：侧边栏面板那一半（文件树 / 拖拽 / 备注 / 预览 / 工作文件） |
| `scripts/splice-panel.mjs` | 把上面两个 src 拼成 `lib/client.js`；`--check` 只校验是否同步 |
| `scripts/install-tarball.ps1` | 打成 tgz 装进 profile（不需要 git；改完代码重跑一次） |
| `scripts/make-icon.py` | 用 Pillow 把 `icon.svg` 的形状重绘成 `assets/icon-180.png`（市场卡片只认位图） |
| `lib/extract.js` | 零依赖文本抽取：docx/xlsx/pptx 用自研 ZIP 读取器，pdf 走 FlateDecode |
| `lib/pdftext.js` | 可选：调本机 PyMuPDF 抽 PDF（中文更稳），探测不到就跳过 |
| `lib/vision.js` | 可选：图片转文字描述（OpenAI 兼容 `chat/completions`，默认智谱 `glm-4v-flash`） |
| `lib/zip.js` | 打包下载用的流式 ZIP 写入器（stored，UTF-8 文件名） |
| `cordis.patch.yml` | bundle 清单（`insert` 一节） |
| `install.ps1` / `uninstall.ps1` | 装 / 卸到 DSH profile（junction + patch 行） |
| `test/*.mjs` | 自检，见「开发」 |
| `icon.svg` / `LICENSE` | 图标、MIT |

## HTTP 接口

前缀 `/dsh-local-library`，同源、无需鉴权（在 DSH 鉴权层之外，设置页与面板直接 fetch）。路径都是相对前缀的：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/list?q=&limit=` | `{items, folders, stats, pending}`；带 `q` 时按检索打分返回并附 `snippet`；`limit` 默认 200、上限 1000 |
| GET | `/tree` | `{folders, items, stats, pending}`，面板首屏一次取回 |
| GET | `/stats` | `{root, count, folders, bytes, bytesText, indexed}` |
| GET | `/config` | `{matchMode}` |
| PUT | `/config` | body `{matchMode:"loose"\|"strict"}`，非法值 400 |
| POST | `/upload?name=&dup=&tags=&folder=&path=&remark=` | body 为原始字节，流式落盘；`dup` = `reject`(默认)/`keep`/`replace`；`path` 是相对路径（`论文/2026/a.pdf`），宿主逐级建目录；同内容重复返回 **409** 带 `duplicate` |
| PATCH | `/item?id=` | body `{name?, tags?, remark?, folderId?}` |
| DELETE | `/item?id=` | 删除条目（同样先进回收站） |
| GET | `/download?id=` | 原文件回流，`content-disposition` 带 RFC5987 文件名 |
| POST | `/bundle` | body `{ids:[]}`，返回 zip（最多 300 个） |
| POST | `/reindex?all=1` | 重跑索引；不传 `all` 只补未建索引的 |
| GET | `/recent?limit=` | `{items}`，按 `lastAccessAt` 倒序（默认 40，上限 300） |
| POST | `/touch?id=` | 记一次访问，`{item}` |
| GET | `/preview?id=&offset=&maxChars=` | `{item, text, offset, total, hasText}`，并记一次访问 |
| GET | `/workfiles?limit=` | `{files, sessions}`：写盘/交付文件清单 + 会话元数据（标题、cwd、交付数） |
| POST | `/import-path` | body `{path, folderId?, remark?}`，把磁盘上的文件收进库 |
| PUT | `/file?id=` | body `{text}`，改文本类文件的正文（同步大小 / sha256 / 索引），`{item, text}` |
| POST | `/open-path?id=` | 给 DSH 文档面板用的真实路径（`open/<id>/<文件名>` 硬链接），`{item, path, name}` |
| POST | `/delete` | body `{ids}`，批量**移入回收站**（软删除），`{removed, trashed:true, ttlDays}` |
| GET | `/trash` | `{items, count, ttlDays}`，回收站条目带 `trashedAt` / `trashDaysLeft` |
| POST | `/restore` | body `{ids}`，从回收站还原，`{restored}` |
| POST | `/purge` | body `{ids}`，彻底删除（连磁盘文件），`{purged}` |
| POST | `/trash/empty` | 清空回收站，`{purged}` |
| POST | `/remark` | body `{ids, remark, mode?}`（`append` 追加），`{updated}` |
| POST | `/folder` | body `{name, parentId?, remark?}`，建文件夹（同层同名幂等），`{folder}` |
| PATCH | `/folder?id=` | body `{name?, remark?, parentId?}`，改名 / 改备注 / 移动（会防环） |
| DELETE | `/folder?id=&recursive=0\|1` | 删除；非递归时里面的文件夹和文件上提到父目录，`{removedItems, removedFolders}` |
| POST | `/move` | body `{ids:[], folderId}`，`{moved}` |

## 工具（进系统提示词，模型每轮可见）

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `library_list` | `limit?` | 列出全部文件 + 文件夹树（路径与备注） |
| `library_search` | `query`、`limit?`、`kind?`、`tag?`、`strict?` | 检索文件名 + 正文 + 标签 + **备注 + 文件夹路径**，返回片段与 `matchedBy`；结果里带「位置」「备注」 |
| `library_read` | `id` 或 `name`、`maxChars?`、`offset?` | 读正文（长文分段续读，返回 `nextOffset`），并记一次访问 |
| `library_save` | `name`、`content`、`tags?`、`folder?`、`remark?` | 把结论/笔记存进库；`folder` 写路径（`论文/2026`）会自动建目录 |

## 检索

中文按两字组合（bigram）切词，英文/数字按词。文件名、标签、备注、文件夹路径的权重高于正文。

- `kind:pdf`、`tag:财务`、`after:2026-10-01`、`before:2026-12-31` 是过滤语法，可以和关键词混写。
- `tag:` 是**精确**匹配整个标签（`tag:财务` 不会带出「财务部」）。
- `after:` / `before:` 只吃 `Date.parse` 认得出的日期；写错时不会静默失效，接口和页面都会提示「已忽略」。
- **严格匹配**：关（默认）宽松打分；开则要求命中率 ≥ 60%，且查询里的英文/数字必须真的出现，整句原样出现一律保留。模型侧可以单次覆盖：`library_search({ query, strict: true })`。

## 可选配置

在 profile 的 `cordis.patch.yml` 里给这个条目加 `config`（不配就是关）：

```yaml
- id: DSH-library
  name: DSH-library
  config:
    vision:
      enabled: true
      apiKey: <你的 key>
      model: glm-4v-flash          # 默认
      endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions  # 默认
```

开了之后上传的图片会被描述成一段文字存进索引，`library_search` 就能按图片内容找。

检索偏好存在 `本地资料库\settings.json`：

```json
{ "matchMode": "strict" }
```

## 开发

客户端半侧是手写的 IIFE（没有打包步骤，DSH 直接按 `dsh.client` 加载 `lib/client.js`）。为了能改得动，源码拆成两份，改完要重新拼：

```bash
node scripts/splice-panel.mjs          # 从 src/base-client.js + src/panel.part.js 生成 lib/client.js
node scripts/splice-panel.mjs --check  # 只校验是否同步（CI 跑这个）
```

改宿主半侧（`lib/*.js`）不用拼，但**重启 DSH Desktop 才生效**（宿主没有 HMR）；改客户端半侧刷新页面即可（前提是这次是重启后第一次加载）。

自检：

```bash
node test/run-all.mjs    # 全部（api / tools / panel / plugin / bugfix / extract / navicon / client / cordis）
```

单跑与说明：

| 文件 | 覆盖 |
| --- | --- |
| `test/api.e2e.mjs` | 起真 http server 打全部路由：建文件夹、带路径上传自动建目录、改备注、按备注/文件夹名检索、最近访问、移动、改名、防环、两种删除、`import-path`、`workfiles`、`open-path`、回收站的软删除 / 还原 / 彻底删除 / 清空 |
| `test/tools.e2e.mjs` | 4 个工具的 schema 与输出文本（文件夹路径、备注、提示词段） |
| `test/panel.smoke.mjs` | 面板：三个槽位、文件夹树、行内备注、最近访问、工作文件与「定位到聊天」、批量条、回收站视图、点文件交给 DSH 文档面板、文案完整 |
| `test/plugin.smoke.mjs` | 端到端：上传→检索→分段读→标签→打包→删除→工具→提示词段 |
| `test/bugfix.test.mjs` | 审计出的每个 bug 一条断言 |
| `test/extract.test.mjs` | 抽取器 19 条（含 PDF 同基线拼行） |
| `test/navicon.test.mjs` | 设置左栏图标的假 DOM 测试（需 profile 里的 react，没有则 SKIP） |
| `test/client.smoke.mjs` | 设置页 SSR（需 profile 里的 react-dom，没有则 SKIP） |
| `test/cordis.integration.mjs` | 真 Cordis 容器里加载插件（需 profile 里的 `@deepseek-ai/cordis`，没有则 SKIP） |

需要 profile 依赖的几套会按 `DSH_PROFILE_DIR` → `DSH_HOME/profiles/{desktop,web}` → `%APPDATA%/dsh-desktop/harness/...` 的顺序找，找不到就 SKIP（不算失败），所以 CI 上也能跑。

`test/check-live.mjs` 是只读的「体检」脚本：直接读你本机真实的库，打印条目数、文件夹数、几次检索命中、统计信息。

## 已知限制

- 没有向量检索：是**关键词打分**（中文 bigram + 拉丁词）。
- PDF 抽取两条路：PyMuPDF（准，能出中文，但要本机有 bundled python）→ 回退流级抽取（只适合 ASCII / 标准编码，中文子集 CID 字体可能乱码）。扫描件没有文本层。
- 图片搜索依赖视觉模型，没配就只能按文件名/标签/备注找。
- ZIP 读取器不支持 ZIP64、加密 ZIP，不校验 CRC；单个 zip 与单条目上限 128 MiB。
- 文本类文件索引上限 4 MiB（超出截断，检索会标明 `truncated`）。
- xlsx 不还原日期序列号、公式结果与合并单元格。
- 「工作生成文件」读的是**会话日志**：只有本机 `sessions/` 目录里的会话能看到；被删掉的工作区文件会标成「文件已不在」，但仍然列出来（可以定位回聊天）。日志上限 96 MiB / 200 个会话。
- 「定位到聊天」依赖客户端服务 `uiWorkspace.openSession`；拿不到时按钮会退化成一条提示，不影响其它功能。
- 回收站保留 30 天，超期条目在**下次启动**时清理（不是定时任务）；「彻底删除」不进 Windows 回收站，删了就没了。
- 拖拽上传靠浏览器的 `webkitGetAsEntry()`（Chromium 系都支持）；Firefox 下拖文件夹只会进来空文件列表。
- 这个前缀路由在 DSH 鉴权层之外（设置页要能直接 fetch），所以**凡是能访问 `127.0.0.1:<端口>` 的本机进程都能读写整个库**。库是本机私有数据，别放密钥。

## 致谢与许可

原版 [Fucaplos/dsh-local-library](https://github.com/Fucaplos/dsh-local-library) 由 Fucaplos 编写（MIT）。本仓库在 0.4.1 基础上加上了上面这些功能，同样以 MIT 发布，见 [LICENSE](LICENSE)。
