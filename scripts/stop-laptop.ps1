# Stop Dev Studio backend intentionally
# Usage: npm run laptop:stop

$ErrorActionPreference = "Continue"
$Port = 3847
$DataDir = Join-Path $env:USERPROFILE ".dev-studio"
$StopFile = Join-Path $DataDir "STOP_SERVER"
$TaskName = "DevStudioBackend"
$StartupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "DevStudioBackend.lnk"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType File -Force -Path $StopFile | Out-Null

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
	Write-Host "Stopping backend on port $Port..."
	$connections | ForEach-Object {
		Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
	}
}

schtasks /End /TN $TaskName 2>$null | Out-Null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

if (Test-Path $StartupShortcut) {
	Remove-Item $StartupShortcut -Force
	Write-Host "Removed Startup shortcut"
}

Write-Host "Dev Studio backend stopped."
Write-Host "To start again: npm run laptop:install  (or npm run laptop for manual window)"
