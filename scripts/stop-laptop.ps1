# Stop Dev Studio backend intentionally
# Usage: npm run laptop:stop

$ErrorActionPreference = "Stop"
$Port = 3847
$DataDir = Join-Path $env:USERPROFILE ".dev-studio"
$StopFile = Join-Path $DataDir "STOP_SERVER"
$TaskName = "DevStudioBackend"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType File -Force -Path $StopFile | Out-Null

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
	Write-Host "Stopping backend on port $Port..."
	$connections | ForEach-Object {
		Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
	}
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
	Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
	Write-Host "Stopped scheduled task: $TaskName"
}

Write-Host "Dev Studio backend stopped."
Write-Host "To start again: npm run laptop:install  (or npm run laptop for manual window)"
