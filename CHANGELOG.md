# 更新记录

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
