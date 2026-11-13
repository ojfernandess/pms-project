# Restaura core-data.dump no Postgres de destino (schema já existente).
# Env: TARGET_DATABASE_URL

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $env:TARGET_DATABASE_URL) {
  Write-Error "Defina TARGET_DATABASE_URL (Postgres destino)."
}
$Dump = Join-Path $Root "postgres-dumps\core-data.dump"
if (-not (Test-Path $Dump)) {
  Write-Error "Ficheiro em falta: $Dump — corra dump-supabase-core.ps1 antes."
}

$Bootstrap = Join-Path $PSScriptRoot "bootstrap-target-postgres.sql"
Write-Host "A aplicar bootstrap (roles + extensões)..."
& psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -f $Bootstrap

Write-Host "A restaurar dados (disable triggers)..."
& pg_restore -d $env:TARGET_DATABASE_URL `
  --data-only `
  --disable-triggers `
  --no-owner `
  --no-privileges `
  -v `
  $Dump

$Verify = Join-Path $PSScriptRoot "verify-core-data.sql"
Write-Host "Verificação:"
& psql $env:TARGET_DATABASE_URL -f $Verify

Write-Host "Restore concluído. Aponte DATABASE_URL da API para TARGET_DATABASE_URL e teste login."
