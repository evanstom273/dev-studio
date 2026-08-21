# Dev Studio - one-window laptop startup (PowerShell)
# Usage: from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/start-laptop.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3847
$DataDir = Join-Path $env:USERPROFILE ".dev-studio"
$RestartFlag = Join-Path $DataDir "RESTART_REQUESTED"
$ServerEntry = Join-Path $RepoRoot "server\dist\index.js"

Set-Location $RepoRoot

$env:DEV_STUDIO_INSTALL_PATH = $RepoRoot

Write-Host ""
Write-Host "Dev Studio laptop backend"
Write-Host "Repo: $RepoRoot"
Write-Host "Remote restart: keep this window open"
Write-Host ""

function Stop-PortListener {
	param([int]$TargetPort)
	$connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
	if (-not $connections) { return }
	Write-Host "Stopping process on port $TargetPort..."
	$connections | ForEach-Object {
		Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
	}
	Start-Sleep -Seconds 2
}

Stop-PortListener -TargetPort $Port

if (Test-Path $RestartFlag) {
	Remove-Item $RestartFlag -Force
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

while ($true) {
	Stop-PortListener -TargetPort $Port
	Write-Host "Starting backend..."
	& node $ServerEntry
	if (-not (Test-Path $RestartFlag)) {
		Write-Host "Server stopped."
		break
	}
	Remove-Item $RestartFlag -Force
	Write-Host "Restart requested - waiting 3 seconds..."
	Start-Sleep -Seconds 3
}
