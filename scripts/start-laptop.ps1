# Dev Studio - laptop backend with crash recovery
# Usage:
#   npm run laptop              # manual window (auto-restarts on crash)
#   npm run laptop:install      # register Windows task (survives reboot + script death)
#   npm run laptop:stop         # stop backend intentionally

param(
	[switch]$Hidden
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3847
$DataDir = Join-Path $env:USERPROFILE ".dev-studio"
$RestartFlag = Join-Path $DataDir "RESTART_REQUESTED"
$StopFile = Join-Path $DataDir "STOP_SERVER"
$ServerEntry = Join-Path $RepoRoot "server\dist\index.js"
$LogFile = Join-Path $DataDir "laptop.log"

Set-Location $RepoRoot

$env:DEV_STUDIO_INSTALL_PATH = $RepoRoot
$env:DEV_STUDIO_AUTO_APPROVE = "true"

function Write-Log {
	param([string]$Message)
	$line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
	Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
	if (-not $Hidden) {
		Write-Host $Message
	}
}

function Stop-PortListener {
	param([int]$TargetPort)
	$connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
	if (-not $connections) { return }
	Write-Log "Stopping process on port $TargetPort..."
	$connections | ForEach-Object {
		Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
	}
	Start-Sleep -Seconds 2
}

# Fresh start clears intentional stop
if (Test-Path $StopFile) {
	Remove-Item $StopFile -Force
}

if (Test-Path $RestartFlag) {
	Remove-Item $RestartFlag -Force
	Write-Log "Cleared stale restart flag"
}

Stop-PortListener -TargetPort $Port

# Tailscale HTTPS proxy (background)
$tailscale = "${env:ProgramFiles}\Tailscale\tailscale.exe"
if (Test-Path $tailscale) {
	Start-Process -FilePath $tailscale -ArgumentList @("serve", "--bg", "http://127.0.0.1:$Port") -WindowStyle Hidden
	Write-Log "Tailscale serve: running in background"
} else {
	Write-Log "Tailscale: not found"
}

Write-Log "Dev Studio laptop backend starting (repo: $RepoRoot)"
if (-not $Hidden) {
	Write-Host ""
	Write-Host "Auto-restarts on crash. Intentional stop: npm run laptop:stop"
	Write-Host ""
}

npm run build:server 2>&1 | Out-Null

while (-not (Test-Path $StopFile)) {
	Stop-PortListener -TargetPort $Port
	Write-Log "Starting backend on port $Port..."

	& node $ServerEntry
	$exitCode = $LASTEXITCODE

	if (Test-Path $StopFile) {
		Write-Log "Stop file detected - exiting"
		break
	}

	if (Test-Path $RestartFlag) {
		Remove-Item $RestartFlag -Force
		Write-Log "Phone restart requested - waiting 3s"
		Start-Sleep -Seconds 3
		continue
	}

	Write-Log "Server exited (code $exitCode) - auto-restarting in 5s"
	Start-Sleep -Seconds 5
}

Write-Log "Dev Studio laptop backend stopped"
