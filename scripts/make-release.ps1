#Requires -Version 7.0
<#
.SYNOPSIS
  给这个仓库发一个 GitHub Release，并把两个可下载文件挂上去：DSH-library.tgz 和 install.ps1。

.DESCRIPTION
  - Release 的 asset 名固定：DSH-library.tgz、install.ps1。
    这样 https://github.com/<owner>/<repo>/releases/latest/download/DSH-library.tgz 永远指向最新一版，
    README 里的「方式二：下两个文件 + 一条命令」才不会因为换版本而来回改链接。
  - 需要 token（classic，勾 repo 权限）。token 只在内存里，不会写进任何文件。
  - 重复发同一版会先把同名 asset 删掉再传，可以放心重跑（先跑 scripts/install-tarball.ps1 重新出包）。

.EXAMPLE
  pwsh -File scripts/make-release.ps1 -Token ghp_xxx
  # 版本号从 package.json 读；tgz 默认取 $DSH_HOME\plugin-dist\DSH-library-<版本>.tgz

.EXAMPLE
  pwsh -File scripts/make-release.ps1 -Token ghp_xxx -Tgz 'D:\某处\DSH-library-0.5.12.tgz' -Notes '这次修了什么'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Tag,
  [string]$Tgz,
  [string]$Repo = 'gch3212/DSH-library',
  [string]$Notes = '',
  [switch]$Draft
)

$ErrorActionPreference = 'Stop'
$PackageDir = Split-Path -Parent $PSScriptRoot

function Fail([string]$Message) {
  Write-Host "× $Message" -ForegroundColor Red
  exit 1
}

# ── 版本号 / 文件
$pkg = Get-Content -LiteralPath (Join-Path $PackageDir 'package.json') -Raw | ConvertFrom-Json
if (-not $Tag) { $Tag = "v$($pkg.version)" }
if (-not $Notes) { $Notes = "$($pkg.name) $($pkg.version)" }

if (-not $Tgz) {
  $home2 = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
  $Tgz = Join-Path $home2 "plugin-dist\$($pkg.name)-$($pkg.version).tgz"
}
if (-not (Test-Path -LiteralPath $Tgz)) {
  Fail "找不到 $Tgz —— 先跑 pwsh -File scripts/install-tarball.ps1 出包，或用 -Tgz 指定。"
}
$Tgz = (Resolve-Path -LiteralPath $Tgz).Path
$InstallPs1 = Join-Path $PackageDir 'install.ps1'
if (-not (Test-Path -LiteralPath $InstallPs1)) { Fail "找不到 $InstallPs1" }

Write-Host "仓库: $Repo" -ForegroundColor DarkGray
Write-Host "版本: $Tag" -ForegroundColor DarkGray
Write-Host "包:   $Tgz ($([math]::Round((Get-Item -LiteralPath $Tgz).Length / 1KB)) KB)" -ForegroundColor DarkGray

$headers = @{
  Authorization          = "Bearer $Token"
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent'           = 'DSH-library-release'
}

# ── 1) 先确认 token 是谁、仓库能不能写
try {
  $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers -Method Get
  Write-Host "= token 属于 $($me.login)" -ForegroundColor DarkGray
} catch {
  Fail "token 无效：$($_.Exception.Message)"
}

$repoApi = "https://api.github.com/repos/$Repo"
try {
  $repoInfo = Invoke-RestMethod -Uri $repoApi -Headers $headers -Method Get
} catch {
  Fail "读不到 $Repo：$($_.Exception.Message)"
}
if (-not $repoInfo.permissions.push) { Fail "这个 token 对 $Repo 没有写权限（需要 classic token 的 repo 权限）。" }

# ── 2) 建 or 复用 release
$release = $null
try {
  $release = Invoke-RestMethod -Uri "$repoApi/releases/tags/$Tag" -Headers $headers -Method Get
  Write-Host "= Release $Tag 已存在（id $($release.id)）" -ForegroundColor DarkGray
} catch {
  $body = @{
    tag_name         = $Tag
    name             = $Tag
    body             = $Notes
    draft            = [bool]$Draft
    prerelease       = $false
    generate_release_notes = $false
  } | ConvertTo-Json
  try {
    $release = Invoke-RestMethod -Uri "$repoApi/releases" -Headers $headers -Method Post -Body $body -ContentType 'application/json'
    Write-Host "+ 建好了 Release $Tag（id $($release.id)）" -ForegroundColor Green
  } catch {
    Fail "建 Release 失败（tag $Tag 在远端存在吗？先 push 代码和标签）：$($_.Exception.Message)"
  }
}

# ── 3) 传 asset（同名先删）
function Publish-Asset([string]$Name, [string]$Path, [string]$ContentType) {
  $existing = $release.assets | Where-Object { $_.name -eq $Name }
  foreach ($asset in $existing) {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers -Method Delete | Out-Null
    Write-Host "- 删掉旧 asset $Name" -ForegroundColor Yellow
  }
  $uri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($Name))"
  $bytes = [IO.File]::ReadAllBytes($Path)
  $uploaded = Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $bytes -ContentType $ContentType
  Write-Host "+ 传好了 $Name（$([math]::Round($uploaded.size / 1KB)) KB）" -ForegroundColor Green
  return $uploaded
}

Publish-Asset -Name 'DSH-library.tgz' -Path $Tgz -ContentType 'application/gzip'
Publish-Asset -Name 'install.ps1' -Path $InstallPs1 -ContentType 'application/octet-stream'

Write-Host ''
Write-Host "发布页：https://github.com/$Repo/releases/tag/$Tag" -ForegroundColor Cyan
Write-Host "固定下载地址：" -ForegroundColor Cyan
Write-Host "  https://github.com/$Repo/releases/latest/download/DSH-library.tgz"
Write-Host "  https://github.com/$Repo/releases/latest/download/install.ps1"
Write-Host ''
Write-Host '别人拿到这两条就能装：' -ForegroundColor Cyan
Write-Host '  pwsh -File install.ps1 -Tarball .\DSH-library.tgz'
