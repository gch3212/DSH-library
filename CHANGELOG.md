# 更新记录

## 0.5.12 — 2026-11-22 · 装上就能用：`install.ps1 -Tarball`

- `install.ps1` 新增 `-Tarball <tgz>`：不建 junction，直接用 DSH 自带的 node + pnpm 把打好的 tgz 装成 profile 里的真拷贝。于是「下载 `install.ps1` + `DSH-library.tgz`，跑一条命令」就能装完，不需要 `git`，也不需要整份仓库。
- 这个模式会先摘掉 profile 里已有的那份（链接或拷贝）、清掉 lockfile 里对应的记录，再 `pnpm add file:<tgz>` —— 否则 pnpm 会因为「同名同版本」直接跳过，装进去还是旧的（0.5.4 踩过）。
- 自检那一步：没有 `.desktop-bin\node.cmd` 的机器改成退回 DSH 运行时里的 `node.exe`，不再整段跳过。
- README「方式二」从「先 clone 再 `install-tarball.ps1`」改成真正的「下两个文件 + 一条命令」，中英文同步。
## 0.5.11 — 2026-11-22 · 每个 HTTP 请求都过 DSH 访问检查

- 路由挂在 webServer 上、在 DSH 路由表之外，因此自己补一道门：`ctx.get("connection").requestRejection(req)`（DSH 的 Host/Origin 检查 + 浏览器鉴权），返回 401/403 就照抄状态码回 `{ error: "forbidden", reason }`。
- 拿不到 `connection`（老版本 DSH、单测、纯 Node）时退回本地兜底：来源地址必须是本机，`Host` 必须是回环/绑定地址或 `trustedHosts` 里的名字，`Origin`（若有）必须与 `Host` 同主机同端口。
- 影响：浏览器里打开的外站页面无法再调用这些接口（这是市场维护者在收录说明里指出的问题）。设置页、侧边栏面板、工具调用照旧。
- 新增 7 条回归断言（同源放行 / 外部 Host 403 / 外站 Origin 403 / 端口不符 403 / connection 拒绝 401 / connection 放行 200）。

## 0.5.10 — 2026-11-22 · 工作生成文件跟着磁盘和会话走

- 会话里交付过、写过，但**磁盘上已经删掉**的文件，不再出现在「工作生成文件」（以前会留一条「文件已不在」）。
- **会话被删除或归档**后，它产出的记录也跟着消失：读 DSH 的 `storages/workspace.json`，跳过 `archivedSessionIds` 里的会话、以及没登记在任何工作区里的会话；读不到这份状态时不过滤，不会误伤。
- `/workfiles` 返回的 `sessions` 只保留还有文件挂着的会话，不再回空分组。
- 视图顶部加一句说明，讲清「只列磁盘上还在的文件」。

## 0.5.9 — 2026-11-22 · 文档补齐（无代码改动）

- README 功能清单补上 0.5.6 的**批量操作**、0.5.7 的**点文件用 DSH 文档面板打开**、0.5.8 的**回收站**。
- 面板章节「三个视图」→「四个视图」；测试表补 `open-path` 与回收站覆盖、抽取器 18 → 19 条。
- 已知限制加一条：回收站保留 30 天、超期在**下次启动**时清理，彻底删除不进 Windows 回收站。
- `README.en.md` 同步。

## 0.5.8 — 2026-11-22 · 回收站：删错了还能捞回来

- 删除改成**软删除**：条目只是打上删除时间、从列表和检索里消失，磁盘上的文件原地不动。
- 侧栏新增第四个入口「回收站」，带待清理数量角标；里面每条显示**还剩几天**可还原。
- 回收站里能单条**还原**、单条**彻底删除**（这一下才真删文件），或**清空回收站**；批量条在回收站视图下也换成还原 / 彻底删除。
- 保留期 30 天（`TRASH_TTL_DAYS`），超期条目在下次启动加载索引时自动清掉，不需要手动维护。
- 原文件夹已被删掉的条目还原时自动落回根目录，不会指向一个不存在的文件夹。
- 新接口：`GET /trash`、`POST /restore`、`POST /purge`、`POST /trash/empty`；`POST /delete` 语义改成软删除，返回值多了 `trashed` 与 `ttlDays`。

## 0.5.7 — 2026-11-21 · 文件交给 DSH 自带的文档面板打开

- 点文件不再显示插件自己做的纯文本预览，改为调用 DSH 客户端自带的文档预览标签页：markdown 渲染、图片、PDF、Office、代码都由 DSH 按扩展名挑渲染器。
- 打开前会把主区域从「本地资料库」切回对话（右侧标签栏只挂在对话上），然后用 `dsh-resource://file/session/<会话>/<路径>` 打开；拿不到那个服务时自动退回插件内的只读预览。
- 新增 `POST /open-path`：在 `$DSH_HOME/local-library/open/<id>/<文件名>` 建一个硬链接，让右栏标签显示用户起的名字而不是内部 id（跨卷失败时退回复制）。
- 去掉 0.5.6 里自己写的那套编辑器（textarea + Ctrl+S）。改文件仍然是「下载 → 改 → 上传」。

## 0.5.6 — 2026-11-21 · 批量操作 + 在面板里直接改文件

- 文件行前面多了复选框：点选、Shift 点选区间、批量条上的「全选」一次选完当前列表（文件夹视图 / 最近访问 / 检索结果各自算一遍）。
- 批量条支持 **批量移动到文件夹**、**批量备注**（追加到每份文件已有的备注后面）、**打包下载**（一个 zip）、**批量删除**，删除前有确认。
- 文本类文件可以在预览面板里**直接编辑**：`编辑` → 改 → `Ctrl+S` 保存（`Esc` 退出）。写回会同步磁盘文件、大小、sha256 与文本索引，改完立刻能搜到新内容；PDF / 图片 / Office 仍然只能下载后改再上传，按钮会直接说明原因。
- 修掉一个竞态：上传后紧接着改文件时，后台还没跑完的抽取可能把旧文本写回索引。现在抽取收尾会核对 sha256，过期结果直接丢弃。
- 新增接口 `PUT /file?id=`、`POST /delete`、`POST /remark`；对应的面板测试与 API 测试一起补上。

## 0.5.5 — 2026-11-21 · PDF 预览不再是「每词一行」

- 重写内置 PDF 抽取的文本排版：以前遇到 `Tm` / `Td` / `T*` 就无条件换行，LaTeX、AIP、IEEE 这类排版会把一句话拆成几十个片段，预览里就成了每个词一行。
  现在按**基线坐标**判断：同一基线上的片段接成一行并补上空格，只有基线真的变化才断行；字号从 `Tm` 的缩放矩阵里取。
- 上标 / 下标（`MoS` + `2`、作者名后的 `1,a)`）按字号比例识别，紧贴前文不插空格，因此标题能还原成 `Synthesized multiwall MoS2 nanotube and nanoribbon field-effect transistors`。
- 文件列表里的文件名最多显示两行（原来是单行省略），鼠标悬停有完整名称提示。
- 新增回归测试：同一基线上的三段（含上标）必须拼成一行，`Td` 仍要真正换行。

## 0.5.4 — 2026-11-21 · tarball 安装器改成真的重装

- **修掉一个让人以为改代码没生效的坑**：`pnpm` 判断要不要重装只看 `file:` 路径和版本号，同名同版本的 tarball 内容变了它也不动，于是 `scripts/install-tarball.ps1` 跑完显示成功、`node_modules` 里还是旧内容。现在脚本第 2、3 步会无条件清掉 profile 里那份（链接用 `rmdir` 摘、拷贝直接删）和 lockfile 里该包的 importer / packages / snapshots 记录，再 `pnpm add` 重新落盘。改完代码重跑一次就一定生效。
- **提醒**：profile 里那份是拷贝，改完仓库代码必须重跑安装器，否则 DSH 加载的还是装进去的那份。

## 0.5.3 — 2026-11-21 · 改名 DSH-library，配一张市场卡片图标

- **包名从 `dsh-local-library` 改成 `DSH-library`**：cordis 实例 id、profile 依赖与 `dsh.profile.bundles`、客户端模块 id、两个安装脚本全部跟着改。上游那份也叫 `dsh-local-library`，同名会在市场里撞成两行、也会被 `pnpm` 当成同一个包互相替换。数据目录仍是 `$DSH_HOME\local-library`，**不需要迁移任何文件**。
- **新增市场卡片图标** `assets/icon-180.png` / `assets/icon-512.png`（由原 `icon.svg` 的几何形状重绘）。插件市场只认 GitHub 托管的位图，SVG 会被拒；`package.json` 的 `icon` 现在指向 PNG。
- README / README.en.md：安装段与新包名对齐，补「为什么改名」与「数据目录没动」两段。

## 0.5.2 — 2026-11-20 · 加一条不依赖 git 的安装路径

功能没动，只多一种装法。

**新增 `scripts/install-tarball.ps1`**
- 先把仓库 `pnpm pack` 成 `.tgz`，再用 DSH 自带的 node + pnpm 装进 profile。装进去是**真拷贝**，lockfile 记 tarball 的 `file:` + `integrity`，全程不需要 `git`，也不需要访问 npm registry。
- 适用场景：DSH 启动的 pnpm 找不到 `git`（这类机器上市场按地址更新会报 `ERR_PNPM_GIT_FETCH_FAILED`），或者就是想要市场装出来那种拷贝。
- 幂等：先摘掉上一次留下的 junction（否则 pnpm 会认为“已经是最新的”而保留链接），再装新版本；装完确认 `dsh.profile.bundles` 里有这个包，没有就补上。

**文档**
- README 的安装方式从三条变四条（新增 tarball），并写清它和 junction 方式的差别：拷贝式改完代码要重新打包重装，junction 式重启即生效。

## 0.5.1 — 2026-11-20 · 安装器修好，别人也能装

功能没动，只修“装到别人机器上会踩”的坑。

**修：安装脚本默认找错 profile**
- `install.ps1` / `uninstall.ps1` 原来默认 `%APPDATA%\dsh-desktop\harness\profiles\web`（老布局），新布局（`$DSH_HOME\profiles\desktop`）上直接跑会失败。现在自动探测：`$DSH_HOME\profiles\{desktop,web}` → `%APPDATA%\dsh-desktop\harness\profiles\*` → `~\.dsh\profiles\*`，找不到才要求 `-ProfileRoot`。

**修：注册机制改成 `dsh.profile.bundles`**
- 原来往 profile 的 `cordis.patch.yml` 插两行——那是老办法，现在的 DSH 靠 `package.json` 的 `dsh.profile.bundles` 加载插件，两边都插会让同一个 id 注册两次、加载器报错。现在脚本只往 bundles 里加一行，并顺手清掉旧版脚本留下的 patch 条目（含缩进注释），删空的 `- insert:` 段一并修掉。

**修：重复执行会崩**
- junction 已存在时，`Get-Item` 取到的 Target 带 `\\?\` 或 `Global\` 前缀，`Resolve-Path` 会报“找不到驱动器。名为 Global\D 的驱动器不存在”。现在先剥前缀再用 `[IO.Path]::GetFullPath()` 比较，最后用 `lib\index.js` 的文件指纹兜底。

**其它**
- `uninstall.ps1` 对应地从 bundles 移除、清理旧 patch 条目，重复执行只打印“跳过”。
- README（中/英）的安装段按脚本真实行为重写：三种装法、两条前置注意（别和上游同名版并存、数据留在各自机器）、面板对 DSH 版本的槽位要求。

## 0.5.0 — 2026-11-20 · 侧边栏面板 / 文件夹 / 备注 / 工作文件

这一版是本仓库（`gch3212/DSH-library`）在原版 `Fucaplos/dsh-local-library` 0.4.1 基础上做的改造，数据结构仍然兼容：老的 `index.json`（v1）启动时自动升级到 v2，文件、标签、正文索引一个都不丢。

**新：工作台首页侧栏入口 + 整页面板**
- `sidebar.panellist` 注册一个图标（`order: 18`），`main` 槽注册同 key 的面板。不用每次进「设置」才能开资料库。
- 面板三栏：左栏（全部文件 / 最近访问 / 工作生成文件 + 文件夹树 + 新建文件夹）、中间列表、右栏预览。

**新：像资源管理器那样管文件**
- 文件夹树：新建、改名、删除、拖文件进文件夹、面包屑导航。根目录只列文件夹，进文件夹才看到文件。
- 文件夹和文件都能写**备注**，备注跟文件名同权重参与检索。
- 文件行内可以改名、写备注、下载、删除。

**新：拖入电脑上的文件夹，保留层级**
- 浏览器侧用 `webkitGetAsEntry()` 递归展开目录树，把相对路径（`论文/2026/投稿/x.pdf`）交给宿主；`POST /upload` 的 `path` 参数逐级建目录，落点和用户拖的位置一致（拖进某个文件夹时，树长在那个文件夹里面）。

**新：最近访问 / 工作生成文件**
- 文件被 `library_read`、面板预览、`POST /touch` 读过就记一笔（`lastAccessAt` + `accessCount`），「最近访问」按它排序。
- 「工作生成文件」直接读本机会话日志：`deliverables/presented`（交付物）与 `write`/`edit` 类工具调用，按会话分组，每行「定位到聊天」跳回原会话（`uiWorkspace.openSession`），「存入资料库」把磁盘上的文件收进库（`POST /import-path`）。

**新：宿主侧接口**
- `GET /tree`（文件夹 + 文件 + 统计一次取回）、`POST|PATCH|DELETE /folder`、`POST /move`、`GET /recent`、`POST /touch`、`GET /workfiles`、`GET /preview`、`POST /import-path`。
- `POST /upload` 支持 `folder` / `path`（相对路径）/ `remark`；`PATCH /item` 支持 `remark` / `folderId`；`GET /list` 多返回 `folders`。

**新：模型能看见文件夹和备注**
- `library_list` 多返回 `folders`（路径 + 备注），`render` 末尾列出「文件夹（N 个……// 备注）」。
- `library_list` / `library_search` / `library_read` 的每一条都带「位置：论文/2026」与「备注：……」，`library_save` 支持 `folder`（自动建目录）与 `remark`。
- 系统提示词段说明：备注和文件夹是用户写的，要当正文读；用户说「论文那个文件夹里」时先看整棵树。

**工程**
- `lib/client.js` 拆成 `src/base-client.js` + `src/panel.part.js`，`scripts/splice-panel.mjs` 负责拼接（`--check` 给 CI 用）。
- 新增 `test/api.e2e.mjs`（HTTP 全链路）、`test/tools.e2e.mjs`（4 个工具 + 提示词）、`test/panel.smoke.mjs`（面板渲染）、`test/mini-render.mjs`（零依赖的渲染探针）、`test/run-all.mjs`（一键跑全部）、`test/check-live.mjs`（只读检查真库）。
- 测试不再硬编码作者本机的 profile 路径，改从 `DSH_HOME` / `DSH_PROFILE_DIR` 找；找不到就 SKIP。

## 0.4.1 — 修完审计剩下的 8 条
- 上传超时（60 秒无进度放弃）、进度事件节流（150ms）、Esc 真正取消标签编辑、`tag:` 改精确匹配、`after:`/`before:` 写错时明确提示已忽略、`init()` 失败可重试、`library_read` 的 `offset` 对齐完整字符、`PATCH /item` 改名后 `ext`/`mime` 跟随更新（补回归断言）。

## 0.4.0 — 严格匹配开关
- 设置页检索框右侧「严格匹配」；命中率 ≥ 60% 且查询里的英文/数字必须真出现，整句原样出现保留。开关存在 `本地资料库\settings.json`，接口 `GET|PUT /config`，`library_search` 可单次覆盖（`strict`）。

## 0.3.1 — 结构化抽取 + 命中来源
- ComfyUI 工作流 JSON 只留模型/提示词/采样/画布/节点标题（214KB → 2,187 字）。
- `matchedBy`（`body`/`name`/`both`），只命中文件名或标签时明确写出来。

## 0.3 — 一轮 bug 审计
- 修文件名 `%` 上传 500、空白文件名、`GET /list` 忽略 `limit` 且吐 `sha256`、`offset` 越界提示当正文、0 字节打包 404、索引无并发上限（改 2 路）、改名后 `ext`/`mime`、emoji 代理对被切断、打包 `drain` 挂死、改一行标签导致其它行标签消失、提示被覆盖、超 300 个静默少打包、`installNavIcon` 在流式输出时高频跑全局选择器（250ms 防抖）。
