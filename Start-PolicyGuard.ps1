param([string]$Model = '', [switch]$ExistingDb)
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'scripts\run_local.py'
$launcherArgs = @($launcher, 'start')
if ($Model) { $launcherArgs += @('--model', $Model) }
if ($ExistingDb) { $launcherArgs += '--existing-db' }
if (Get-Command py -ErrorAction SilentlyContinue) { & py -3.12 @launcherArgs } else { & python @launcherArgs }
if ($LASTEXITCODE -ne 0) { throw 'PolicyGuard startup failed; inspect the message above.' }
