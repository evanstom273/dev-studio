# Dev Studio — one-window laptop startup (PowerShell)
# Usage: right-click → Run with PowerShell, OR from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/start-laptop.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Set-Location $RepoRoot

$env:DEV_STUDIO_INSTALL_PATH = $RepoRoot
$env:DEV_STUDIO_RESTART_COMMAND = "npm run start:server"

Write-Host ""
Write-Host "Dev Studio laptop backend"
Write-Host "Repo: $RepoRoot"
Write-Host ""

# Tailscale HTTPS proxy (background — no extra window)
$tailscale = "${env:ProgramFiles}\Tailscale\tailscale.exe"
if (Test-Path $tailscale) {
	Start-Process -FilePath $tailscale -ArgumentList @("serve", "--bg", "http://127.0.0.1:3847") -WindowStyle Hidden
	Write-Host "Tailscale serve: running in background"
} else {
	Write-Host "Tailscale: not found (skip — use http://laptop:3847 if on tailnet)"
}

Write-Host ""
Write-Host "Starting server — keep THIS window open."
Write-Host "Close this window to stop the server."
Write-Host ""

npm run dev:server
