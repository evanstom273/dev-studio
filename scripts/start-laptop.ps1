# Dev Studio - one-window laptop startup (PowerShell)
# Usage: from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/start-laptop.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3847
$DataDir = Join-Path $env:USERPROFILE ".dev-studio"

Set-Location $RepoRoot

$env:DEV_STUDIO_INSTALL_PATH = $RepoRoot

Write-Host ""
Write-Host "Dev Studio laptop backend"
Write-Host "Repo: $RepoRoot"
Write-Host "Remote restart: keep this window open"
Write-Host ""

# Kill orphaned server processes from failed restarts
$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connections) {
	Write-Host "Stopping orphaned process on port $Port..."
	$connections | ForEach-Object {
		Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
	}
	Start-Sleep -Seconds 2
}

# Clear stale restart flag from failed phone restarts
$restartFlag = Join-Path $DataDir "RESTART_REQUESTED"
if (Test-Path $restartFlag) {
	Remove-Item $restartFlag -Force
	Write-Host "Cleared stale restart flag"
}

# Tailscale HTTPS proxy (background, no extra window)
$tailscale = "${env:ProgramFiles}\Tailscale\tailscale.exe"
if (Test-Path $tailscale) {
	Start-Process -FilePath $tailscale -ArgumentList @("serve", "--bg", "http://127.0.0.1:$Port") -WindowStyle Hidden
	Write-Host "Tailscale serve: running in background"
} else {
	Write-Host "Tailscale: not found (skip - use https://your-laptop.ts.net if on tailnet)"
}

Write-Host ""
Write-Host "Starting server - keep THIS window open."
Write-Host "Close this window to stop the server."
Write-Host ""

npm run build:server
npm run start:server
