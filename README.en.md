# DSH Library

<img src="assets/icon-180.png" width="96" height="96" alt="DSH Library">

[中文](README.md) · [Changelog](CHANGELOG.md)

> **This repo is a fork of [Fucaplos/dsh-local-library](https://github.com/Fucaplos/dsh-local-library) (0.5.x).** It keeps the original local document library — files stay on your machine, every conversation can search and read them — and adds a **sidebar panel on the workbench home**, **Explorer-like folders with rename and notes**, **folder drag-and-drop that preserves the directory tree**, plus **Recently accessed** and **Work-generated files** views that can jump back to the chat that produced a file. `index.json` upgrades from v1 to v2 automatically; no data is lost.

A **local document library plugin for DSH Desktop**: one file cabinet shared across all conversations. Files never leave the machine. Every new chat knows about it — the plugin registers four tools (`library_list`, `library_search`, `library_read`, `library_save`) and a system-prompt section, so the model looks things up by itself.

## Features

- **Two entry points**: Settings → Local Library, and an icon on the workbench home sidebar that opens a full-page panel.
- **Explorer-like file management**: folder tree, create / rename / delete folders, drag files into folders, breadcrumb navigation, inline rename.
- **Notes on both folders and files**: notes and folder paths are indexed at the same weight as file names, and show up in the tool output the model sees (`位置：论文/2026`, `备注：…`).
- **Drag a whole folder**: the directory tree is preserved (`论文/2026/投稿/x.pdf` becomes three nested folders), not flattened.
- **Recently accessed**: ordered by real reads/previews (`library_read` and panel previews both count).
- **Work-generated files**: deliverables and files written by tools, grouped by session; each row can **jump to the chat** or **save into the library**.
- **Content extraction**: `.md/.txt/.csv/.json/...`, `.docx`, `.xlsx`, `.pptx`, `.pdf` become searchable text; PDF prefers a local PyMuPDF (better CJK) and falls back to a zero-dependency stream extractor; images are described by a vision model if one is configured.
- **Duplicate detection**: re-uploading identical bytes asks replace / keep both / skip.
- **Everything local**: `$DSH_HOME/local-library` (default `%APPDATA%\dsh-desktop\harness\local-library`).

## Install

Requires DSH Desktop and PowerShell 7 on Windows (the script creates a junction; on Linux/macOS symlink the repo into the profile's `node_modules` instead). The sidebar panel uses the `main` / `sidebar.panellist` slots, so it needs a reasonably recent DSH; older builds simply won't show the panel entry, the Settings page keeps working.

**Option 1 — script (recommended)**

```powershell
git clone https://github.com/gch3212/DSH-library.git
cd DSH-library
pwsh -File install.ps1
```

The script finds the profile itself (`$DSH_HOME\profiles\desktop`, `$DSH_HOME\profiles\web`, `%APPDATA%\dsh-desktop\harness\profiles\*`, `~\.dsh\profiles\*`), or you can point at it:

```powershell
pwsh -File install.ps1 -ProfileRoot 'D:\my-dsh\harness\profiles\desktop'
```

It does three things, backing up every file it touches to `*.bak-DSH-library-<timestamp>`:

1. Creates `profiles\<name>\node_modules\DSH-library` as a junction to this repo.
2. Adds `"DSH-library"` to `dsh.profile.bundles` in `profiles\<name>\package.json` — that list is what DSH loads plugins from; the package's own `cordis.patch.yml` (`dsh.bundle.patch`) is applied automatically, so nothing has to be added to the profile's `cordis.patch.yml`. Profiles patched by the old 0.4.x script get that stale entry removed (registering the same id twice breaks the loader).
3. Verifies that both `DSH-library` and `DSH-library/client` resolve.

It is idempotent and never touches `pnpm-lock.yaml`. Then **restart DSH Desktop** (host half) and **reload the page** (client half).

```powershell
pwsh -File uninstall.ps1             # library data is kept
pwsh -File uninstall.ps1 -PurgeData  # also delete $DSH_HOME\local-library
```

**Option 2 — tarball (no git, no network)**

```powershell
git clone https://github.com/gch3212/DSH-library.git
cd DSH-library
pwsh -File scripts/install-tarball.ps1
```

The script runs `pnpm pack` to produce `DSH-library-<version>.tgz` (by default under `$DSH_HOME\plugin-dist`), then installs it into the profile with the node and pnpm bundles DSH ships. What lands in `node_modules` is a real copy, and the lockfile records the tarball's `file:` spec plus `integrity` — no `git`, no npm registry access.

Use it when the pnpm DSH spawns cannot see `git` (market updates then fail with `ERR_PNPM_GIT_FETCH_FAILED`), or when you want a market-style copy rather than a link back to the working tree. The trade-off: **re-run the script after editing the code** and restart DSH; Option 1 picks up edits on restart alone. The script is idempotent, strips a previous junction first (otherwise pnpm reports "already up to date" and keeps the link), and re-installs over the old copy.

**Option 3 — plugin market**

The repo is a standard npm package (`main` + `exports` + `dsh.bundle.patch` + `dsh.client`), so the market can install it by address:

```
github:gch3212/DSH-library
```

That path fetches through pnpm, so `git` must be visible to the pnpm DSH spawns (installing Git for Windows is enough). Updates reinstall from the repo and therefore **overwrite local edits** — use Option 1 if you plan to change the code. The plugin manager shows the package name `DSH-library` (since 0.5.3; it used to be `dsh-local-library`). The rename keeps the two forks from colliding in the market and in pnpm, which treats identical package names as the same package. The data directory is still `$DSH_HOME\local-library`, so nothing has to be migrated.

**Option 4 — manual**

Copy or link this repo to `profiles\<name>\node_modules\DSH-library` and add `"DSH-library"` to `dsh.profile.bundles` in the profile's `package.json` (older DSH builds: add the `- id: DSH-library` / `name: 'DSH-library'` pair under `- insert:` in `cordis.patch.yml`).

**Two things to know first**

- **Don't install both forks at once**: the package names differ (`DSH-library` vs `dsh-local-library`), so they can coexist — but they register the same four tools (`library_list` and friends) and share one data directory, `$DSH_HOME\local-library`. Uninstall the upstream plugin first.
- **Library data is per machine**: everything lives in `$DSH_HOME\local-library` and is not carried along with the plugin.

## The sidebar panel

- **Left**: three views (All files / Recently accessed / Work-generated files), the folder tree, and "New folder".
- **All files**: breadcrumb on top; folder rows expand and accept drops (dropping a file on a folder moves it there); the root lists folders only, like Explorer. Each row offers **rename / note / download / delete**.
- **Drop files or folders**: dropping on empty space lands in the current folder, dropping on a folder row lands inside it, and the directory hierarchy is preserved. Uploads show progress; duplicates are reported.
- **Notes**: folders and files both take a human sentence ("advisor's version", "for submission"). Notes are searchable and visible to the model.
- **Recently accessed**: sorted by `lastAccessAt`, with an access counter.
- **Work-generated files**: parsed from local session logs (`deliverables/presented` events plus files written by `write`/`edit` tools), grouped per session. **Jump to chat** calls `uiWorkspace.openSession`; **Save to library** imports the file from disk so every conversation can search it.
- **Batch actions**: every row has a checkbox; a selection bar offers batch move, batch note (append), zip download and batch delete (with confirmation).
- **Preview and editing**: the right pane renders the extracted text of the selected file (long text pages in). Text files can be edited in place — `Ctrl+S` writes back to disk and reindexes; PDF, images and Office files must be downloaded, edited, then uploaded again.

## Data layout

```
$DSH_HOME\local-library\
├── index.json          # items + folders + counters (v2, auto-upgraded from v1)
├── settings.json       # search preferences (matchMode)
├── files\<id><ext>     # original bytes
└── text\<id>.txt       # extracted text used for search
```

Item fields: `id`, `name`, `ext`, `mime`, `size`, `sha256`, `kind`, `createdAt`, `updatedAt`, `addedBy`, `tags[]`, `folderId`, `remark`, `lastAccessAt`, `accessCount`, `textChars`, `indexed`. Folder fields: `id`, `name`, `parentId`, `remark`, `createdAt`, `updatedAt`.

## Repo layout

| Path | Purpose |
| --- | --- |
| `lib/index.js` | Host half: HTTP routes, four tools, system-prompt section, indexing pipeline |
| `lib/store.js` | Storage and search: atomic `index.json`, folder tree, CJK bigram scoring, dedupe, paged reads |
| `lib/sessions.js` | Reads local session logs (framed zstd) to attribute work files to sessions |
| `lib/client.js` | Client half (**generated**): settings section + sidebar panel |
| `src/base-client.js`, `src/panel.part.js` | Client sources, spliced by `scripts/splice-panel.mjs` |
| `lib/extract.js`, `lib/pdftext.js`, `lib/vision.js`, `lib/zip.js` | Extraction, optional PDF/vision backends, streaming ZIP writer |
| `test/*.mjs` | Test suites (see below) |

## HTTP API

Prefix `/dsh-local-library`, same-origin, no auth (it sits outside DSH's auth layer):

`GET /list?q=&limit=`, `GET /tree`, `GET /stats`, `GET|PUT /config`, `POST /upload?name=&dup=&tags=&folder=&path=&remark=`, `PATCH /item?id=`, `DELETE /item?id=`, `GET /download?id=`, `POST /bundle`, `POST /reindex?all=1`, `GET /recent?limit=`, `POST /touch?id=`, `GET /preview?id=&offset=&maxChars=`, `GET /workfiles?limit=`, `PUT /file?id=`, `POST /delete`, `POST /remark`, `POST /import-path`, `POST /folder`, `PATCH /folder?id=`, `DELETE /folder?id=&recursive=0|1`, `POST /move`.

## Tools

| Tool | Parameters | Purpose |
| --- | --- | --- |
| `library_list` | `limit?` | All files plus the folder tree (paths and notes) |
| `library_search` | `query`, `limit?`, `kind?`, `tag?`, `strict?` | Name + body + tags + **notes + folder path**, with snippets and `matchedBy` |
| `library_read` | `id` or `name`, `maxChars?`, `offset?` | Read extracted text (paged), records an access |
| `library_save` | `name`, `content`, `tags?`, `folder?`, `remark?` | Save notes/conclusions; `folder` creates the path |

Search supports `kind:`, `tag:` (exact), `after:`, `before:` filters; `strict` requires ≥ 60 % term coverage. CJK is matched by bigrams.

## Optional vision config

```yaml
- id: DSH-library
  name: DSH-library
  config:
    vision:
      enabled: true
      apiKey: <key>
      model: glm-4v-flash
      endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
```

## Development

`lib/client.js` is generated from `src/base-client.js` + `src/panel.part.js`:

```bash
node scripts/splice-panel.mjs          # regenerate
node scripts/splice-panel.mjs --check  # verify sync (CI)
node test/run-all.mjs                  # all suites
```

Host-side changes need a DSH Desktop restart; client-side changes need a page reload (after a restart that picked up the new manifest).

Suites: `api.e2e` (real HTTP server over every route), `tools.e2e` (tool schemas and rendered text), `panel.smoke` (panel rendering, slots, jump-to-chat), `plugin.smoke` (end-to-end upload → search → read → bundle → delete), `bugfix.test` (one assertion per audited bug), `extract.test` (18 extraction cases), `navicon.test`, `client.smoke`, `cordis.integration` (the last three need a real DSH profile and SKIP without one). `test/check-live.mjs` inspects the real library read-only.

## Known limitations

- Keyword scoring only — no embeddings.
- Scanned PDFs have no text layer; CJK subset fonts may garble in the fallback extractor.
- Image search needs a vision model.
- ZIP reader: no ZIP64, no encryption, no CRC check; 128 MiB caps.
- Text indexing truncates at 4 MiB.
- Work-generated files come from session logs on this machine (96 MiB / 200 sessions caps); deleted files are listed but marked missing.
- Jump-to-chat needs the `uiWorkspace` client service; without it the button degrades to a notice.
- Folder drops need `webkitGetAsEntry()` (Chromium-based DSH web UI).
- The route prefix sits outside the auth layer: anything that can reach `127.0.0.1:<port>` can read and write the library. Don't store secrets in it.

## Credits & license

Original work © 2026 Fucaplos ([upstream](https://github.com/Fucaplos/dsh-local-library)), MIT. This fork adds the sidebar panel, folders, notes, tree-preserving folder drops, recently-accessed and work-file views; also MIT, see [LICENSE](LICENSE).
