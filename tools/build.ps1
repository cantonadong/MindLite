$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Syntax checks only; no tests or app launch.
Get-ChildItem -LiteralPath 'ui' -Filter '*.js' | ForEach-Object {
    & node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax error: $($_.Name)" }
}

$toolchainVersion = '20261006'
$downloadDir = Join-Path (Get-Location) 'target/toolchain-download'
$llvmRoot = Join-Path $downloadDir "llvm-mingw-$toolchainVersion-ucrt-x86_64"
$llvmBin = Join-Path $llvmRoot 'bin'
if (-not (Test-Path (Join-Path $llvmBin 'dlltool.exe'))) {
    New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
    $archiveName = "llvm-mingw-$toolchainVersion-ucrt-x86_64.zip"
    $archivePath = Join-Path $downloadDir $archiveName
    if (-not (Test-Path $archivePath)) {
        & gh release download $toolchainVersion --repo mstorsjo/llvm-mingw --pattern $archiveName --dir $downloadDir
        if ($LASTEXITCODE -ne 0) {
            # Retry with a new gh process after SimpleWall has time to apply its rule.
            Start-Sleep -Seconds 10
            & gh release download $toolchainVersion --repo mstorsjo/llvm-mingw --pattern $archiveName --dir $downloadDir --clobber
            if ($LASTEXITCODE -ne 0) { throw 'Unable to download portable linker tools.' }
        }
    }
    & "$env:SystemRoot/System32/tar.exe" -xf $archivePath -C $downloadDir
    if ($LASTEXITCODE -ne 0) { throw 'Unable to extract linker tools.' }
}
$rustSysroot = (& rustc +stable-x86_64-pc-windows-gnu --print sysroot).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Rust stable-x86_64-pc-windows-gnu toolchain is required.' }
$env:PATH = $llvmBin + ';' + $env:PATH
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $llvmBin 'ld.lld.exe'
# Link directly with LLD and Rust's bundled GNU CRT/import libraries. The old
# bundled GNU ld leaves merged raw-dylib import slots unresolved at runtime.
$env:RUSTFLAGS = '-C linker-flavor=ld.lld -C link-self-contained=yes'
$env:MINDLITE_WINDRES = Join-Path $llvmBin 'x86_64-w64-mingw32-windres.exe'
& (Join-Path $PSScriptRoot 'prepare-icon.ps1')
& cargo +stable-x86_64-pc-windows-gnu build --release --locked --offline
if ($LASTEXITCODE -ne 0) { throw 'Rust release build failed.' }

$loader = Get-ChildItem -Path 'target/release/build/webview2-com-sys-*/out/x64/WebView2Loader.dll' | Select-Object -First 1
if (-not $loader) { throw 'WebView2Loader.dll was not produced by the build.' }
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
# Replace the same user-testing executable, after ending existing instances.
Get-Process -Name MindLite -ErrorAction SilentlyContinue | Stop-Process -Force
Copy-Item -LiteralPath 'target/release/MindLite.exe' -Destination 'dist/MindLite.exe' -Force
Copy-Item -LiteralPath $loader.FullName -Destination 'dist/WebView2Loader.dll' -Force
Copy-Item -LiteralPath 'README.md' -Destination 'dist/README.md' -Force
Copy-Item -LiteralPath 'Start-MindLite.bat' -Destination 'dist/Start-MindLite.bat' -Force
Write-Host "EXE: $((Resolve-Path 'dist/MindLite.exe').Path)"
