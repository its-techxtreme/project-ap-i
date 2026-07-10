#Requires -Version 5.1
<#
.SYNOPSIS
  Remove Project AP-I stack autostart Scheduled Task for the current user.
#>

$ErrorActionPreference = 'Stop'
$TaskName = 'ProjectAP-I Stack Autostart'

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "No task named '$TaskName' — nothing to remove."
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed Scheduled Task: $TaskName"
Write-Host "Worker/n8n already running are not stopped. Use: pnpm stack:down"
