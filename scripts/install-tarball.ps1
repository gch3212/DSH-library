#Requires -Version 7.0
<#
.SYNOPSIS
  把本目录打包成 tarball，再装进 DSH profile（拷贝式安装，不需要 git，也不需要联网）。

.DESCRIPTION
  和 install.ps1 的区别：
    install.ps1        —— 建 junction，profile 里指向本目录；改代码重启即生效，但要求 profile 里有一个链接。
    install-tarball.ps1 —— pnpm pack 出 .tgz 再 pnpm add 装成真拷贝；没有 git 依赖，但改完代码要重新跑一遍。

  什么时候用它：
    · 这台机器上 DSH 的 pnpm 找不到 git（市场更新会失败）；
    · 想要"像市场装的那样"是拷贝而不是链接；
    · 想验证别人用 tarball 装能不能跑通。

  幂等：重复跑会用新版本覆盖；会先把上一次留下的 junction 摘掉，免得 pnpm 认为"已经是最新的"而不换。

.EXAMPLE
  pwsh -File scripts/install-tarball.ps1
  pwsh -File scripts/install-tarball.ps1 -ProfileRoot 'D:\DSH Data\Home\profiles\desktop'
#>
[CmdletBinding()]
param(
  [string]$ProfileRoot,
  [string]$DistDir
)

$ErrorActionPreference = 'Stop'
$PackageName = 'DSH-library'
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Fail([string]$Message) {
  Write-Host "× $Message" -ForegroundColor Red
  exit 1
}

function Step([string]$Message) {
  Write-Host "`n$Message" -ForegroundColor Cyan
}

function Ok([string]$Message) {
  Write-Host "  + $Message" -ForegroundColor Green
}

function Skip([string]$Message) {
  Write-Host "  = $Message" -ForegroundColor DarkGray
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

# 找 node.exe 与 pnpm.mjs：优先 DSH 自带运行时，退到 PATH
function Resolve-NodeExe {
  if ($env:DSH_HOME) {
    $runtimes = Join-Path $env:DSH_HOME 'dsh-runtimes'
    if (Test-Path -LiteralPath $runtimes) {
      $found = Get-ChildItem -LiteralPath $runtimes -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'dependencies\node\bin\node.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
      if ($found) { return $found }
    }
  }
  $onPath = Get-Command node -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}

function Resolve-PnpmScript([string]$NodeExe) {
  if ($env:DSH_HOME) {
    $runtimes = Join-Path $env:DSH_HOME 'dsh-runtimes'
    if (Test-Path -LiteralPath $runtimes) {
      $found = Get-ChildItem -LiteralPath $runtimes -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'dependencies\pnpm\bin\pnpm.mjs' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
      if ($found) { return $found }
    }
  }
  return $null
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'package.json'))) {
  Fail "找不到 $RepoRoot\package.json —— 这个脚本要放在仓库的 scripts 目录里。"
}

$NodeExe = Resolve-NodeExe
if (-not $NodeExe) { Fail '找不到 node.exe。请设置 DSH_HOME，或把 node 加进 PATH。' }
$PnpmScript = Resolve-PnpmScript $NodeExe
if (-not $PnpmScript) { Fail '找不到 DSH 自带的 pnpm.mjs。请设置 DSH_HOME，或改用 install.ps1（junction 方式）。' }

if (-not $ProfileRoot) { $ProfileRoot = Resolve-DshProfileRoot }
if (-not $ProfileRoot) {
  Fail "找不到 DSH profile。请用 -ProfileRoot 指定，一般在 <DSH_HOME>\profiles\desktop（当前 DSH_HOME=$env:DSH_HOME）。"
}

if (-not $DistDir) {
  if ($env:DSH_HOME) { $DistDir = Join-Path $env:DSH_HOME 'plugin-dist' } else { $DistDir = Join-Path $RepoRoot 'dist' }
}

Write-Host "仓库:    $RepoRoot" -ForegroundColor DarkGray
Write-Host "profile: $ProfileRoot" -ForegroundColor DarkGray
Write-Host "node:    $NodeExe" -ForegroundColor DarkGray
Write-Host "pnpm:    $PnpmScript" -ForegroundColor DarkGray
Write-Host "dist:    $DistDir" -ForegroundColor DarkGray

$PackageVersion = (Get-Content -LiteralPath (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).version
$LinkPath = Join-Path $ProfileRoot "node_modules\$PackageName"
$LockPath = Join-Path $ProfileRoot 'pnpm-lock.yaml'
$ProfilePkgPath = Join-Path $ProfileRoot 'package.json'

# 1) 打包
Step "1/4 打包 $PackageName $PackageVersion"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Push-Location $RepoRoot
try {
  $packOut = & $NodeExe $PnpmScript pack --pack-destination $DistDir 2>&1
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Fail "pnpm pack 失败：`n$($packOut -join "`n")"
  }
} finally {
  if ((Get-Location).Path -eq $RepoRoot) { Pop-Location }
}
$Tarball = Join-Path $DistDir "$PackageName-$PackageVersion.tgz"
if (-not (Test-Path -LiteralPath $Tarball)) {
  $latest = Get-ChildItem -LiteralPath $DistDir -Filter "$PackageName-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { Fail "打包后找不到 $Tarball" }
  $Tarball = $latest.FullName
}
Ok "$Tarball ($((Get-Item -LiteralPath $Tarball).Length) 字节)"

# 2) 先彻底拿掉 profile 里现有的这一份。
#    pnpm 判断"要不要重装"只看 file: 路径和版本号：同名同版本的 tarball 内容变了它也不动，
#    所以这里必须无条件清掉（链接用 rmdir 摘，拷贝直接删），下一步才真的重新落盘。
Step "2/4 清掉 profile 里现有的这一份"
if (Test-Path -LiteralPath $LinkPath) {
  $item = Get-Item -LiteralPath $LinkPath -Force
  $isLink = ($item.LinkType -eq 'Junction') -or ($item.LinkType -eq 'SymbolicLink') -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
  if ($isLink) {
    cmd /c rmdir "$LinkPath" | Out-Null
    if (Test-Path -LiteralPath $LinkPath) { Fail "摘不掉链接 $LinkPath（可能被占用）。请先关掉 DSH Desktop 再试。" }
    Ok '摘掉了旧的 junction（只删链接，没动它指向的目录）'
  } else {
    Remove-Item -LiteralPath $LinkPath -Recurse -Force
    if (Test-Path -LiteralPath $LinkPath) { Fail "删不掉 $LinkPath（可能被占用）。请先关掉 DSH Desktop 再试。" }
    Ok '删掉了旧的拷贝'
  }
} else {
  Skip 'profile 里还没有这个包'
}

# 3) 清掉 lock 里这个包的旧解析结果（importer 三条 + packages/snapshots 的包块），
#    否则 pnpm add 会说 Already up to date 而不重新装。
Step "3/4 清理 lockfile 里这个包的旧解析"
if (Test-Path -LiteralPath $LockPath) {
  $lockText = Get-Content -LiteralPath $LockPath -Raw
  $name = [regex]::Escape($PackageName)
  $importerPattern = '(?m)^ {6}' + $name + ':\r?\n(?: {8}[^\n]*\r?\n)*'
  $packagePattern = '(?m)^ {2}' + $name + '@[^\n]*:\r?\n(?: {4}[^\n]*\r?\n)*'
  $before = $lockText.Length
  $lockText = [regex]::Replace($lockText, $importerPattern, '')
  $lockText = [regex]::Replace($lockText, $packagePattern, '')
  if ($lockText.Length -ne $before) {
    Set-Content -LiteralPath $LockPath -Value $lockText -NoNewline -Encoding utf8
    Ok "已移除 lock 里 $($before - $lockText.Length) 个字符的旧记录"
  } else {
    Skip 'lock 里没有这个包的记录'
  }
} else {
  Skip '没有 pnpm-lock.yaml'
}

# 4) 装
Step "4/4 装进 profile"
$Spec = 'file:' + ($Tarball -replace '\\', '/')
Push-Location $ProfileRoot
try {
  $addOut = & $NodeExe $PnpmScript add $Spec --ignore-scripts --config.confirmModulesPurge=false 2>&1
  $addCode = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($addCode -ne 0) {
  Fail "pnpm add 失败：`n$($addOut -join "`n")"
}
Ok (($addOut | Select-Object -Last 3) -join ' / ')

# 5) 登记到 dsh.profile.bundles（拷贝式安装没有 install.ps1 那一步，得自己来）
Step "5/5 确认 dsh.profile.bundles 里有它"
$raw = Get-Content -LiteralPath $ProfilePkgPath -Raw
try {
  $pkg = $raw | ConvertFrom-Json
} catch {
  Fail "profile 的 package.json 解析失败：$($_.Exception.Message)"
}
$bundles = @()
if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) { $bundles = @($pkg.dsh.profile.bundles) }
if ($bundles -contains $PackageName) {
  Skip 'dsh.profile.bundles 里已有，跳过'
} else {
  $match = [regex]::Match($raw, '"bundles"\s*:\s*\[')
  if (-not $match.Success) {
    Fail 'profile 的 package.json 里没有 dsh.profile.bundles 数组，请用 install.ps1 或手动加上。'
  }
  $indent = '      '
  $indentMatch = [regex]::Match($raw, '(?m)^[ \t]+"')
  if ($indentMatch.Success) { $indent = $indentMatch.Value }
  Copy-Item -LiteralPath $ProfilePkgPath -Destination "$ProfilePkgPath.bak-install-tarball" -Force
  $insert = $match.Value + "`r`n" + $indent + '"' + $PackageName + '",'
  $raw = $raw.Remove($match.Index, $match.Length).Insert($match.Index, $insert)
  Set-Content -LiteralPath $ProfilePkgPath -Value $raw -NoNewline -Encoding utf8
  Ok "已加入 dsh.profile.bundles（备份：$ProfilePkgPath.bak-install-tarball）"
}

# 6) 自检
$installedPkg = Join-Path $LinkPath 'package.json'
if (-not (Test-Path -LiteralPath $installedPkg)) { Fail "装完后找不到 $installedPkg" }
$installed = Get-Content -LiteralPath $installedPkg -Raw | ConvertFrom-Json
$item = Get-Item -LiteralPath $LinkPath -Force
$isStillLink = ($item.LinkType -eq 'Junction') -or ($item.LinkType -eq 'SymbolicLink')
Write-Host "`n装好了：$($installed.name) $($installed.version)（$($(if ($isStillLink) { '仍是链接，请检查' } else { '拷贝' }))）" -ForegroundColor Green
Write-Host '下一步：完全退出并重新启动 DSH Desktop，然后刷新页面。' -ForegroundColor Yellow
