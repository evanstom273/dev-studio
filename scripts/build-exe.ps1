param(
    [switch]$DebugBuild
)

$ErrorActionPreference = "Stop"

Write-Host "=== Dev Studio Desktop (.exe) Builder ===" -ForegroundColor Cyan

# 1. Ensure Cargo & Rust paths are in PATH without quote interference
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) {
    $cleanPath = $env:PATH.Replace('"', '')
    $env:PATH = "$cargoBin;$cleanPath"
}

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
    Write-Host "`n[!] Notice: MSVC C++ Linker (link.exe) is not installed on this machine." -ForegroundColor Yellow
    Write-Host "Tauri requires the Visual C++ Build Tools on Windows." -ForegroundColor Yellow
    Write-Host "You have two options:" -ForegroundColor Cyan
    Write-Host "  1. Install C++ tools locally with:" -ForegroundColor White
    Write-Host "     winget install Microsoft.VisualStudio.2022.BuildTools --force --override `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools`"`n" -ForegroundColor White
    Write-Host "  2. Or build the .exe automatically in GitHub Actions:" -ForegroundColor White
    Write-Host "     Go to GitHub > Actions > 'Build & Release Desktop App (.exe)' > Run workflow`n" -ForegroundColor White
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
