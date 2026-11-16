param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [ValidateRange(1024, 65535)][int]$Port = 15432,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$testDataPath = [IO.Path]::GetFullPath((Join-Path $workspacePath '.tmp/pg-f0'))
if (-not $testDataPath.StartsWith((Join-Path $workspacePath '.tmp') + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Directorio de pruebas fuera del workspace.'
}
$pgCtlPath = Join-Path $PgBin 'pg_ctl.exe'
if ($Stop) {
  & $pgCtlPath -D $testDataPath -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener el cluster de pruebas.' }
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $testDataPath 'PG_VERSION'))) {
  New-Item -ItemType Directory -Path $testDataPath -Force | Out-Null
  & (Join-Path $PgBin 'initdb.exe') -D $testDataPath -U quickly_test -A trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Falló initdb de pruebas.' }
}
& $pgCtlPath -D $testDataPath status
if ($LASTEXITCODE -ne 0) {
  & $pgCtlPath -D $testDataPath -l (Join-Path $workspacePath '.tmp/pg-f0.log') -o "-h 127.0.0.1 -p $Port" -w start
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL de pruebas.' }
}
Write-Output "PostgreSQL de pruebas disponible en loopback:$Port. Detener con -Stop."
