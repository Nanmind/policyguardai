$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'scripts\run_local.py'
if (Get-Command py -ErrorAction SilentlyContinue) { & py -3.12 $launcher stop } else { & python $launcher stop }
if ($LASTEXITCODE -ne 0) { throw 'PolicyGuard stop failed; inspect the message above.' }
