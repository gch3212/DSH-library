#Requires -Version 7.0
<#
.SYNOPSIS
  把 DSH-library 装进 DSH Desktop 的 profile。

.DESCRIPTION
  两种模式：
    · 默认（junction）：把当前目录这份源码链接进 profile\node_modules，改代码重启即生效。
    · -Tarball <tgz>：不建链接，把打好的 tgz 用 DSH 自带的 pnpm 装成真拷贝 —— 适合手头
      只有 install.ps1 和 tgz 两个文件的人（不需要 git，也不需要整份仓库）。
  两种模式都会把包名登记进 profile 的 dsh.profile.bundles（DSH 按这个列表加载插件）。
  幂等：已经装过就只做自检。装完需要重启 DSH Desktop（宿主半侧）并刷新页面（客户端半侧）。

.EXAMPLE
  pwsh -File install.ps1
  # profile 会自动找（$DSH_HOME\profiles\desktop 等）；找不到时再手动指定：
  pwsh -File install.ps1 -ProfileRoot 'D:\DSH Data\Home\profiles\desktop'

.EXAMPLE
  pwsh -File install.ps1 -Tarball .\DSH-library.tgz
  # 只有 install.ps1 和 tgz 时用这条：不建 junction，装成拷贝
#>
[CmdletBinding()]
param(
  [string]$ProfileRoot,
  [string]$Tarball
)

$ErrorActionPreference = 'Stop'
$PackageName = 'DSH-library'
$PackageDir = $PSScriptRoot

function Fail([string]$Message) {
  Write-Host "× $Message" -ForegroundColor Red
  exit 1
}

# 在 DSH 自带运行时里找一个文件（-Tarball 模式要用它的 node + pnpm 把 tgz 装进 profile）
function Find-RuntimeFile([string]$Filter, [string]$Pattern) {
  $roots = [Collections.Generic.List[string]]::new()
  if ($env:DSH_HOME) { $roots.Add((Join-Path $env:DSH_HOME 'dsh-runtimes')) }
  if ($env:USERPROFILE) { $roots.Add((Join-Path $env:USERPROFILE '.dsh\dsh-runtimes')) }
  $roots.Add((Join-Path $env:APPDATA 'dsh-desktop\harness\dsh-runtimes'))
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $hit = Get-ChildItem -LiteralPath $root -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match $Pattern } | Sort-Object FullName | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

function Resolve-NodeExe {
  $found = Find-RuntimeFile 'node.exe' '\\dependencies\\node\\'
  if ($found) { return $found }
  if ($env:DSH_DESKTOP_NODE_EXECUTABLE -and (Test-Path -LiteralPath $env:DSH_DESKTOP_NODE_EXECUTABLE)) {
    return $env:DSH_DESKTOP_NODE_EXECUTABLE
  }
  $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}

function Resolve-PnpmScript {
  return (Find-RuntimeFile 'pnpm.mjs' '\\pnpm\\bin\\')
}

# -Tarball 模式：把 tgz 装成 profile/node_modules/<包名> 里的真拷贝（不建 junction）
function Install-FromTarball([string]$TgzPath) {
  if (-not $TgzPath) { Fail "-Tarball 需要一个 .tgz 文件路径。" }
  if (-not (Test-Path -LiteralPath $TgzPath)) { Fail "找不到 tarball：$TgzPath" }
  $tgz = (Resolve-Path -LiteralPath $TgzPath).Path
  if (-not ($tgz.ToLower().EndsWith('.tgz') -or $tgz.ToLower().EndsWith('.tar.gz'))) {
    Fail "不是 .tgz / .tar.gz 文件：$tgz"
  }
  $node = Resolve-NodeExe
  if (-not $node) {
    Fail "找不到 node.exe。请先装好 DSH Desktop，或用 $env:DSH_DESKTOP_NODE_EXECUTABLE 指定。"
  }
  $pnpm = Resolve-PnpmScript
  if (-not $pnpm) {
    Fail "找不到 DSH 自带的 pnpm.mjs（<DSH_HOME>\dsh-runtimes\...\dependencies\pnpm\bin\pnpm.mjs）。"
  }

  # 1) 先摘掉已有的那一份，否则 pnpm 会因为「同名同版本」直接跳过，装进去的还是旧的
  if (Test-Path -LiteralPath $LinkPath) {
    $item = Get-Item -LiteralPath $LinkPath -Force
    if ($item.LinkType) {
      & cmd /c rmdir "$LinkPath" | Out-Null
      if (Test-Path -LiteralPath $LinkPath) { Fail "摘不掉旧链接：$LinkPath（先手动删掉再重跑）" }
      Write-Host "- 摘掉了旧链接 $PackageName" -ForegroundColor Yellow
    } else {
      Remove-Item -LiteralPath $LinkPath -Recurse -Force
      Write-Host "- 删掉了旧拷贝 $PackageName" -ForegroundColor Yellow
    }
  }

  # 2) 清掉 lockfile 里这个名字的记录（importer 三条 + packages/snapshots 块），逼 pnpm 重新落盘
  $lockPath = Join-Path $ProfileRoot 'pnpm-lock.yaml'
  if (Test-Path -LiteralPath $lockPath) {
    $lockRaw = [IO.File]::ReadAllText($lockPath)
    $before = $lockRaw.Length
    $lockRaw = [regex]::Replace($lockRaw, ('(?m)^ {6}' + [regex]::Escape($PackageName) + ':\r?\n(?: {8}[^\n]*\r?\n)*'), '')
    $lockRaw = [regex]::Replace($lockRaw, ('(?m)^ {2}' + [regex]::Escape($PackageName) + '@[^\n]*:\r?\n(?: {4}[^\n]*\r?\n)*'), '')
    if ($lockRaw.Length -ne $before) {
      $backup = "$lockPath.bak-$PackageName-tarball-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
      Copy-Item -LiteralPath $lockPath -Destination $backup
      [IO.File]::WriteAllText($lockPath, $lockRaw, (New-Object Text.UTF8Encoding($false)))
      Write-Host "- 清掉了 lockfile 里的旧记录（备份：$backup）" -ForegroundColor Yellow
    }
  }

  # 3) 真的装上
  $spec = 'file:' + ($tgz -replace '\\', '/')
  Push-Location -LiteralPath $ProfileRoot
  try {
    & $node $pnpm add $spec --ignore-scripts --prefer-offline --config.confirmModulesPurge=false
    if ($LASTEXITCODE -ne 0) { Fail "pnpm add 失败（退出码 $LASTEXITCODE）" }
  } finally {
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath (Join-Path $LinkPath "lib\index.js"))) {
    Fail "装完了但 $LinkPath\lib\index.js 不存在 —— tgz 里可能不是这个包。"
  }
  $installed = Get-Content -LiteralPath (Join-Path $LinkPath "package.json") -Raw | ConvertFrom-Json
  Write-Host "+ 装好了 $($installed.name) $($installed.version)（tarball 拷贝）" -ForegroundColor Green
}

# 自动找 profile：优先 $DSH_HOME\profiles\{desktop,web}，再看老布局 %APPDATA%\dsh-desktop\harness\profiles\*
function Resolve-DshProfileRoot {
  $candidates = [Collections.Generic.List[string]]::new()
  if ($env:DSH_HOME) {
    $candidates.Add((Join-Path $env:DSH_HOME 'profiles\desktop'))
    $candidates.Add((Join-Path $env:DSH_HOME 'profiles\web'))
  }
  $candidates.Add((Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\desktop'))
  $candidates.Add((Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\web'))
  if ($env:USERPROFILE) {
    $candidates.Add((Join-Path $env:USERPROFILE '.dsh\profiles\desktop'))
    $candidates.Add((Join-Path $env:USERPROFILE '.dsh\profiles\web'))
  }
  foreach ($dir in $candidates) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    if ((Test-Path -LiteralPath (Join-Path $dir 'cordis.patch.yml')) -and (Test-Path -LiteralPath (Join-Path $dir 'package.json'))) { return $dir }
  }
  return $null
}

if (-not $ProfileRoot) { $ProfileRoot = Resolve-DshProfileRoot }
if (-not $ProfileRoot) {
  Fail "找不到 DSH profile。请用 -ProfileRoot 指定，一般在 <DSH_HOME>\profiles\desktop（当前 DSH_HOME=$env:DSH_HOME）。"
}
Write-Host "profile: $ProfileRoot" -ForegroundColor DarkGray

$LinkPath = Join-Path $ProfileRoot "node_modules\$PackageName"
$PatchPath = Join-Path $ProfileRoot 'cordis.patch.yml'

if (-not (Test-Path -LiteralPath $PatchPath)) {
  Fail "找不到 $PatchPath —— ProfileRoot 传错了吗？"
}
if (-not $Tarball -and -not (Test-Path -LiteralPath (Join-Path $PackageDir 'lib\index.js'))) {
  Fail "本目录下没有 lib\index.js。请在包根目录运行，或改用 -Tarball <tgz> 直接装打包好的文件。"
}

if ($Tarball) {
  Install-FromTarball -TgzPath $Tarball
} else {
# 1) junction：让包名在这个 profile 里解析得到
#    junction 的 Target 在部分 PowerShell 版本里带 \??\ 前缀，直接 Resolve-Path 会报
#    「找不到驱动器。名为 Global\D 的驱动器不存在」，所以先规整路径再比。
$linked = $false
if (Test-Path -LiteralPath $LinkPath) {
  $item = Get-Item -LiteralPath $LinkPath -Force
  $target = if ($item.Target) { @($item.Target)[0] } else { $null }
  if ($target) {
    if ($target.StartsWith('\??\')) { $target = $target.Substring(4) }
    if ($target.StartsWith('Global\')) { $target = $target.Substring(7) }
  }
  $sameTarget = $false
  if ($target) {
    try { $sameTarget = ([IO.Path]::GetFullPath($target) -eq [IO.Path]::GetFullPath($PackageDir)) } catch { $sameTarget = $false }
  }
  if (-not $sameTarget -and (Test-Path -LiteralPath (Join-Path $LinkPath "lib\index.js"))) {
    # 兜底：路径字符串对不上时，比对入口文件指纹，确认链接的就是本目录这份包
    try {
      $sameTarget = ((Get-FileHash -LiteralPath (Join-Path $LinkPath "lib\index.js")).Hash -eq (Get-FileHash -LiteralPath (Join-Path $PackageDir "lib\index.js")).Hash)
    } catch { $sameTarget = $false }
  }
  if ($sameTarget) {
    $kind = if ($item.LinkType) { 'junction' } else { '拷贝' }
    Write-Host "= 已有的 $kind 就是这份代码，跳过：$LinkPath" -ForegroundColor DarkGray
    $linked = $true
  } else {
    Fail "$LinkPath 已存在但指向别处（$target）。先删掉它再重跑。"
  }
}
if (-not $linked) {
  $parent = Split-Path -Parent $LinkPath
  if (-not (Test-Path -LiteralPath $parent)) { Fail "profile 下没有 node_modules：$parent" }
  & cmd /c mklink /J "$LinkPath" "$PackageDir" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "mklink /J 失败（退出码 $LASTEXITCODE）" }
  Write-Host "+ junction -> $LinkPath" -ForegroundColor Green
}
}

# 2) 登记到 profile 的 dsh.profile.bundles —— DSH 按这个列表加载插件，
#    插件自己的 cordis.patch.yml（package.json 的 dsh.bundle.patch）由 DSH 自动套用。
$pkgJsonPath = Join-Path $ProfileRoot 'package.json'
$pkgRaw = [IO.File]::ReadAllText($pkgJsonPath)
$bundlesMatch = [regex]::Match($pkgRaw, '"bundles"\s*:\s*\[')
if (-not $bundlesMatch.Success) {
  Fail "$pkgJsonPath 里没有 dsh.profile.bundles —— 这个目录可能不是 DSH Desktop 的 profile。"
}
$bundlesRegex = '"bundles"\s*:\s*\[(?<body>[\s\S]*?)\]'
$bundlesBody = [regex]::Match($pkgRaw, $bundlesRegex).Groups['body'].Value
if ($bundlesBody -match ('"' + [regex]::Escape($PackageName) + '"')) {
  Write-Host "= dsh.profile.bundles 里已有 $PackageName，跳过" -ForegroundColor DarkGray
} else {
  $insertPos = $bundlesMatch.Index + $bundlesMatch.Length
  $newline = if ($pkgRaw.Contains("`r`n")) { "`r`n" } else { "`n" }
  $indent = '      '
  $indentMatch = [regex]::Match($pkgRaw.Substring($insertPos), '^\r?\n([ \t]+)"')
  if ($indentMatch.Success) { $indent = $indentMatch.Groups[1].Value }
  $pkgRaw = $pkgRaw.Insert($insertPos, ($newline + $indent + '"' + $PackageName + '",'))
  $backup = "$pkgJsonPath.bak-$PackageName-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
  Copy-Item -LiteralPath $pkgJsonPath -Destination $backup
  [IO.File]::WriteAllText($pkgJsonPath, $pkgRaw, (New-Object Text.UTF8Encoding($false)))
  Write-Host "+ dsh.profile.bundles 已登记 $PackageName（备份：$backup）" -ForegroundColor Green
}

# 2b) 旧版脚本往 profile 的 cordis.patch.yml 插过条目 —— 同一个 id 注册两次会让加载器报错，清掉。
if (Test-Path -LiteralPath $PatchPath) {
  $patchRaw = [IO.File]::ReadAllText($PatchPath)
  $patchEol = if ($patchRaw.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = [string[]]($patchRaw -split "\r?\n")
  $kept = [Collections.Generic.List[string]]::new()
  $dropped = 0
  $skipName = $false
  foreach ($line in $lines) {
    if ($skipName) {
      $skipName = $false
      if ($line -match ('^\s+name:\s*[''"]?' + [regex]::Escape($PackageName) + '[''"]?\s*$')) { $dropped++; continue }
    }
    if ($line -match ('^\s+-\s+id:\s*[''"]?' + [regex]::Escape($PackageName) + '[''"]?\s*$')) {
      $dropped++
      $skipName = $true
      while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -match '^\s+#') { $kept.RemoveAt($kept.Count - 1) }
      continue
    }
    $kept.Add($line)
  }
  # 条目删完后可能只剩一个空的 "insert:" 段 —— 空 insert 会被加载器判非法，一起丢掉
  $pruned = [Collections.Generic.List[string]]::new()
  for ($i = 0; $i -lt $kept.Count; $i++) {
    if ($kept[$i] -match '^-?\s*insert:\s*$') {
      $next = $null
      for ($j = $i + 1; $j -lt $kept.Count; $j++) {
        if ($kept[$j].Trim() -ne '') { $next = $kept[$j]; break }
      }
      if ($null -eq $next -or $next -notmatch '^\s') { continue }
    }
    $pruned.Add($kept[$i])
  }
  while ($pruned.Count -gt 0 -and $pruned[$pruned.Count - 1].Trim() -eq '') { $pruned.RemoveAt($pruned.Count - 1) }
  $kept = $pruned

  if ($dropped -gt 0) {
    $backup = "$PatchPath.bak-$PackageName-legacy-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $PatchPath -Destination $backup
    [IO.File]::WriteAllText($PatchPath, (($kept -join $patchEol) + $patchEol), (New-Object Text.UTF8Encoding($false)))
    Write-Host "- 清掉了 profile cordis.patch.yml 里的旧条目 $dropped 行（备份：$backup）" -ForegroundColor Yellow
  }
}
# 3) 解析自检：包名能否解析到宿主半侧与客户端半侧
#    注意：--input-type=module + -e 在这台机器的 electron-as-node 垫片里不输出，
#    所以落一个临时 .mjs 跑。
$node = Join-Path $env:APPDATA 'dsh-desktop\harness\.desktop-bin\node.cmd'
if (-not (Test-Path -LiteralPath $node)) { $node = Resolve-NodeExe }
$env:ELECTRON_RUN_AS_NODE = '1'
$pkgJson = Join-Path $ProfileRoot 'package.json'
if ((Test-Path -LiteralPath $node) -and (Test-Path -LiteralPath $pkgJson)) {
  $probe = Join-Path ([IO.Path]::GetTempPath()) ("dsh-ll-probe-{0}.mjs" -f ([guid]::NewGuid().ToString('N')))
  @'
import { createRequire } from 'node:module'
const require = createRequire(process.argv[2])
let bad = 0
for (const spec of ['DSH-library', 'DSH-library/client']) {
  try { console.log('  OK   ' + spec + ' -> ' + require.resolve(spec)) }
  catch (error) { bad++; console.log('  FAIL ' + spec + ' -> ' + error.message) }
}
process.exitCode = bad === 0 ? 0 : 1
'@ | Set-Content -LiteralPath $probe -Encoding utf8NoBOM
  $env:ELECTRON_NO_ASAR = '1'
  try {
    & $node $probe $pkgJson
    if ($LASTEXITCODE -ne 0) { Fail '包名解析失败，检查 junction 是否被清理了' }
  } finally {
    Remove-Item -LiteralPath $probe -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host '下一步：' -ForegroundColor Cyan
Write-Host '  1) 重启 DSH Desktop（宿主半侧在启动时加载插件）'
Write-Host '  2) 刷新页面（F5），设置 → 左栏应出现「本地资料库」'
Write-Host '  3) 新开一个对话，模型应能看到 library_* 四个工具'
