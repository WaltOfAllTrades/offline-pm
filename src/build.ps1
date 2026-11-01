# Builds the single offline file: inlines CSS, app JS, SQLite (WASM) and SheetJS into offline-pm.html.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$read = { param($p) [IO.File]::ReadAllText($p) }
$noScriptClose = { param($s) $s -replace '</script', '<\/script' }
$tpl  = & $read "$PSScriptRoot\index.html"
$css  = & $read "$PSScriptRoot\styles.css"
$app  = (Get-ChildItem "$PSScriptRoot\js\*.js" | Sort-Object Name | ForEach-Object { "// ===== $($_.Name) =====`n" + (& $read $_.FullName) }) -join "`n"
$sql  = & $noScriptClose (& $read "$root\libs\sql-wasm.js")
$xlsx = & $noScriptClose (& $read "$root\libs\xlsx.full.min.js")
$wasm = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\libs\sql-wasm.wasm"))
$out  = $tpl.Replace('/*__CSS__*/', $css).Replace('/*__APP__*/', (& $noScriptClose $app)).Replace('/*__SQLJS__*/', $sql).Replace('/*__XLSX__*/', $xlsx).Replace('__WASM_B64__', $wasm)
[IO.File]::WriteAllText("$root\offline-pm.html", $out, (New-Object Text.UTF8Encoding $false))
"Built offline-pm.html ({0:N0} KB)" -f ((Get-Item "$root\offline-pm.html").Length / 1KB)
