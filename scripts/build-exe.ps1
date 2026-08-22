param(
    [switch]$DebugBuild
)

$ErrorActionPreference = "Stop"

Write-Host "=== Dev Studio Desktop (.exe) Builder ===" -ForegroundColor Cyan

# 1. Check if Rust & Cargo are available
try {
    $rustVersion = rustc --version
    Write-Host "Found Rust: $rustVersion" -ForegroundColor Green
} catch {
    Write-Error "Rust is not installed or not in PATH. Please install from https://rustup.rs"
    exit 1
}

# 2. Check for C++ Linker (MSVC link.exe)
$linkCmd = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $linkCmd) {
    Write-Host "`n[Notice] MSVC Linker (link.exe) was not found in PATH." -ForegroundColor Yellow
    Write-Host "To compile Tauri apps natively on Windows, install C++ Build Tools using:" -ForegroundColor Yellow
    Write-Host "  winget install Microsoft.VisualStudio.2022.BuildTools --force --override `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools`"`n" -ForegroundColor Cyan
}

# 3. Build Web Assets
Write-Host "Building web frontend & server assets..." -ForegroundColor Cyan
npm run build:all
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed."
    exit $LASTEXITCODE
}

# 4. Run Tauri Build
Write-Host "Running Tauri Desktop bundler..." -ForegroundColor Cyan
if ($DebugBuild) {
    npx tauri build --debug
} else {
    npx tauri build
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "Executable outputs can be found in:" -ForegroundColor Green
    Write-Host "  src-tauri/target/release/Dev Studio.exe" -ForegroundColor White
    Write-Host "  src-tauri/target/release/bundle/nsis/" -ForegroundColor White
    Write-Host "  src-tauri/target/release/bundle/msi/" -ForegroundColor White
}
