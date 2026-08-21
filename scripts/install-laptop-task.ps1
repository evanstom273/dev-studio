# Install Dev Studio to start at Windows logon (no admin required)
# Run once: npm run laptop:install

$ErrorActionPreference = "Continue"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$StartScript = Join-Path $RepoRoot "scripts\start-laptop.ps1"
$TaskName = "DevStudioBackend"
$StopFile = Join-Path $env:USERPROFILE ".dev-studio\STOP_SERVER"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupShortcut = Join-Path $StartupFolder "DevStudioBackend.lnk"
$RunArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`" -Hidden"

if (Test-Path $StopFile) {
	Remove-Item $StopFile -Force
}

function Start-BackendNow {
	Write-Host "Starting backend now..."
	Start-Process -FilePath "powershell.exe" -ArgumentList $RunArgs -WorkingDirectory $RepoRoot -WindowStyle Hidden
}

function Install-StartupShortcut {
	$shell = New-Object -ComObject WScript.Shell
	$link = $shell.CreateShortcut($StartupShortcut)
	$link.TargetPath = "powershell.exe"
	$link.Arguments = $RunArgs
	$link.WorkingDirectory = $RepoRoot
	$link.Description = "Dev Studio backend for phone access"
	$link.Save()
	Write-Host "Installed Startup shortcut: $StartupShortcut"
}

function Install-ScheduledTask {
	# schtasks works for the current user without admin on most home Windows installs
	$taskCommand = "powershell.exe $RunArgs"
	$existing = schtasks /Query /TN $TaskName 2>$null
	if ($LASTEXITCODE -eq 0) {
		schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
	}
	schtasks /Create /TN $TaskName /TR $taskCommand /SC ONLOGON /RL LIMITED /F | Out-Null
	if ($LASTEXITCODE -ne 0) {
		throw "schtasks failed with exit code $LASTEXITCODE"
	}
	schtasks /Run /TN $TaskName 2>$null | Out-Null
	Write-Host "Installed scheduled task: $TaskName"
}

$installed = $false

try {
	Install-ScheduledTask
	$installed = $true
} catch {
	Write-Host "Scheduled task install failed (access denied is normal without admin)."
	Write-Host "Falling back to Startup folder shortcut..."
	try {
		Install-StartupShortcut
		Start-BackendNow
		$installed = $true
	} catch {
		Write-Host "Startup shortcut install also failed: $_"
	}
}

if (-not $installed) {
	Write-Host ""
	Write-Host "Could not install auto-start. Run manually: npm run laptop"
	exit 1
}

Write-Host ""
Write-Host "Dev Studio will start when you log in to Windows."
Write-Host "The backend auto-restarts on crash while the script is running."
Write-Host ""
Write-Host "To stop:  npm run laptop:stop"
Write-Host "Log file: $env:USERPROFILE\.dev-studio\laptop.log"
Write-Host ""
