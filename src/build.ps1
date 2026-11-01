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
# HTML parsing turns CRLF into LF, so do it here too, or the script hashes below won't match.
$out  = $out -replace "`r`n?", "`n"
# Content-Security-Policy: only these exact inline scripts may run (no inline handlers, no eval), and the page
# can't reach the network, so text from a shared file can't run code or send the plan anywhere (DECISIONS #62).
# 'self' only lets the test suite load tests/tests.js when the folder is served locally.
$sha  = [Security.Cryptography.SHA256]::Create()
$hashes = [regex]::Matches($out, '(?s)<script>(.*?)</script>') | ForEach-Object { "'sha256-" + [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($_.Groups[1].Value))) + "'" }
$csp  = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' $($hashes -join ' '); style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'"
$out  = $out.Replace('__CSP__', $csp)
[IO.File]::WriteAllText("$root\offline-pm.html", $out, (New-Object Text.UTF8Encoding $false))
"Built offline-pm.html ({0:N0} KB)" -f ((Get-Item "$root\offline-pm.html").Length / 1KB)
