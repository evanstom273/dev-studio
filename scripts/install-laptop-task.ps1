# Register Dev Studio as a Windows scheduled task (starts at logon, restarts on failure)
# Run once: npm run laptop:install

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$StartScript = Join-Path $RepoRoot "scripts\start-laptop.ps1"
$TaskName = "DevStudioBackend"
$StopFile = Join-Path $env:USERPROFILE ".dev-studio\STOP_SERVER"

if (Test-Path $StopFile) {
	Remove-Item $StopFile -Force
}

$Action = New-ScheduledTaskAction `
	-Execute "powershell.exe" `
	-Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`" -Hidden" `
	-WorkingDirectory $RepoRoot

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
	-AllowStartIfOnBatteries `
	-DontStopIfGoingOnBatteries `
	-StartWhenAvailable `
	-RestartInterval (New-TimeSpan -Minutes 1) `
	-RestartCount 999 `
	-ExecutionTimeLimit (New-TimeSpan -Days 3650)

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
	-TaskName $TaskName `
	-Action $Action `
	-Trigger $Trigger `
	-Settings $Settings `
	-Principal $Principal `
	-Description "Dev Studio backend for phone access over Tailscale" `
	-Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installed scheduled task: $TaskName"
Write-Host "  - Starts when you log in to Windows"
Write-Host "  - Restarts automatically if it crashes"
Write-Host "  - Runs hidden in background"
Write-Host ""
Write-Host "To stop:  npm run laptop:stop"
Write-Host "Log file: $env:USERPROFILE\.dev-studio\laptop.log"
Write-Host ""
