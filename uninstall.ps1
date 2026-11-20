#Requires -Version 7.0
<#
.SYNOPSIS
  从 DSH Desktop 的 profile 里卸载 DSH-library。

.DESCRIPTION
  只撤销 install.ps1 做的两件事（patch 条目、node_modules 里的 junction）。
  资料库里的文件默认保留；加 -PurgeData 才会连 $DSH_HOME\local-library 一起删。
  卸载完同样需要重启 DSH Desktop 才生效。

.EXAMPLE
  pwsh -File uninstall.ps1
  pwsh -File uninstall.ps1 -PurgeData
#>
[CmdletBinding()]
param(
  [string]$ProfileRoot,
  [switch]$PurgeData
)

$ErrorActionPreference = 'Stop'
$PackageName = 'DSH-library'

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
  Write-Host "× 找不到 DSH profile。请用 -ProfileRoot 指定，一般在 <DSH_HOME>\profiles\desktop（当前 DSH_HOME=$env:DSH_HOME）。" -ForegroundColor Red
  exit 1
}
Write-Host "profile: $ProfileRoot" -ForegroundColor DarkGray

$LinkPath = Join-Path $ProfileRoot "node_modules\$PackageName"
$PatchPath = Join-Path $ProfileRoot 'cordis.patch.yml'

# 1) 撤销 junction（只删链接，不动仓库里的包体）
if (Test-Path -LiteralPath $LinkPath) {
  $item = Get-Item -LiteralPath $LinkPath -Force
  if ($item.LinkType -ne 'Junction') {
    Write-Host "× $LinkPath 不是 junction，拒绝删除" -ForegroundColor Red
    exit 1
  }
  & cmd /c rmdir "$LinkPath" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "× rmdir 失败（退出码 $LASTEXITCODE）" -ForegroundColor Red
    exit 1
  }
  Write-Host "- junction 已移除" -ForegroundColor Green
} else {
  Write-Host '= junction 不存在，跳过' -ForegroundColor DarkGray
}

# 2) 从 profile 的 dsh.profile.bundles 里移除（DSH 按这个列表加载插件）
$pkgJsonPath = Join-Path $ProfileRoot 'package.json'
if (Test-Path -LiteralPath $pkgJsonPath) {
  $pkgRaw = [IO.File]::ReadAllText($pkgJsonPath)
  $bundlesMatch = [regex]::Match($pkgRaw, '"bundles"\s*:\s*\[(?<body>[\s\S]*?)\]')
  if ($bundlesMatch.Success) {
    $body = $bundlesMatch.Groups['body'].Value
    $names = @([regex]::Matches($body, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    if ($names -contains $PackageName) {
      $keptNames = @($names | Where-Object { $_ -ne $PackageName })
      $nl = if ($pkgRaw.Contains("`r`n")) { "`r`n" } else { "`n" }
      $indentMatch = [regex]::Match($body, '^\r?\n([ \t]+)"')
      $indent = if ($indentMatch.Success) { $indentMatch.Groups[1].Value } else { '      ' }
      $trailMatch = [regex]::Match($body, '\r?\n([ \t]*)$')
      $trail = if ($trailMatch.Success) { $trailMatch.Groups[1].Value } else { '    ' }
      $rebuild = (@($keptNames | ForEach-Object { $nl + $indent + '"' + $_ + '"' }) -join ',')
      if ($keptNames.Count -gt 0) { $rebuild = $rebuild + "$nl$trail" }
      $bodyStart = $bundlesMatch.Groups['body'].Index
      $pkgRaw = $pkgRaw.Remove($bodyStart, $body.Length).Insert($bodyStart, $rebuild)
      $backup = "$pkgJsonPath.bak-$PackageName-uninstall-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
      Copy-Item -LiteralPath $pkgJsonPath -Destination $backup
      [IO.File]::WriteAllText($pkgJsonPath, $pkgRaw, (New-Object Text.UTF8Encoding($false)))
      Write-Host "- dsh.profile.bundles 已移除 $PackageName（备份：$backup）" -ForegroundColor Green
    } else {
      Write-Host "= dsh.profile.bundles 里没有 $PackageName，跳过" -ForegroundColor DarkGray
    }
  }
}
# 3) 清掉旧版脚本插进 profile cordis.patch.yml 的条目（没有就跳过）
if (Test-Path -LiteralPath $PatchPath) {
  $raw = [IO.File]::ReadAllText($PatchPath)
  $eol = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = [string[]]($raw -split "\r?\n")

  $kept = [Collections.Generic.List[string]]::new()
  $removed = 0
  $skipNext = $false
  foreach ($line in $lines) {
    if ($skipNext) {
      $skipNext = $false
      if ($line -match "^\s+name:\s*$([regex]::Escape($PackageName))\s*$") { $removed++; continue }
    }
    if ($line -match "^\s+-\s+id:\s*$([regex]::Escape($PackageName))\s*$") {
      $removed++
      $skipNext = $true
      # 顺手回收紧贴在它上面的说明注释（缩进注释；顶格注释属于别的段落，不动）
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

  if ($removed -gt 0) {
    $backup = "$PatchPath.bak-$PackageName-uninstall-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $PatchPath -Destination $backup
    [IO.File]::WriteAllText($PatchPath, (($kept -join $eol) + $eol), (New-Object Text.UTF8Encoding($false)))
    Write-Host "- cordis.patch.yml 已清掉 $removed 行（备份：$backup）" -ForegroundColor Green
  } else {
    Write-Host '= cordis.patch.yml 里没有本插件，跳过' -ForegroundColor DarkGray
  }
}

# 4) 资料库数据
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:APPDATA 'dsh-desktop\harness' }
$dataDir = Join-Path $dshHome 'local-library'
if ($PurgeData) {
  if (Test-Path -LiteralPath $dataDir) {
    Remove-Item -LiteralPath $dataDir -Recurse -Force
    Write-Host "- 数据目录已删除：$dataDir" -ForegroundColor Yellow
  }
} elseif (Test-Path -LiteralPath $dataDir) {
  Write-Host "= 资料库文件保留在：$dataDir（要一起删就加 -PurgeData）" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '重启 DSH Desktop 后插件即彻底卸载。' -ForegroundColor Cyan
