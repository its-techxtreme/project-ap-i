#Requires -Version 5.1
<#
.SYNOPSIS
  Install Project AP-I stack autostart for the current Windows user (at logon).

.DESCRIPTION
  Creates a Scheduled Task that runs scripts/stack-autostart.mjs when you log on.
  - Runs as YOUR user only (not SYSTEM)
  - Highest available privileges = limited (no admin elevation)
  - Does not modify system services or Docker internals
  - Safe to re-run (updates the same task)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install-stack-autostart.ps1
  pnpm stack:autostart:install
#>

$ErrorActionPreference = 'Stop'

$TaskName = 'ProjectAP-I Stack Autostart'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Error 'Node.js (node) not found on PATH. Install Node 20+ and retry.'
}
$NodeExe = $NodeCmd.Source

$AutostartJs = Join-Path $RepoRoot 'scripts\stack-autostart.mjs'
if (-not (Test-Path $AutostartJs)) {
  Write-Error "Missing $AutostartJs"
}

# Quote paths for schtasks / Task Scheduler
$Arg = "`"$AutostartJs`""
$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument $Arg -WorkingDirectory $RepoRoot

# Delay so Docker Desktop / OneDrive / shell can settle after logon
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Trigger.Delay = 'PT3M'

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -RestartCount 0 `
  -MultipleInstances IgnoreNew

# Current user, limited rights — never RunLevel Highest
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Force | Out-Null

Write-Host "Installed Scheduled Task: $TaskName"
Write-Host "  Runs at logon as: $env:USERNAME (Limited)"
Write-Host "  Script: $AutostartJs"
Write-Host "  Log:    $RepoRoot\.stack-autostart.log"
Write-Host ""
Write-Host "Optional: Docker Desktop → Settings → General → Start Docker Desktop when you sign in"
Write-Host "Test now:  pnpm stack:autostart"
Write-Host "Uninstall: pnpm stack:autostart:uninstall"
Write-Host "Status:    pnpm stack:status"
