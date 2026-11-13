# Exporta dados do Supabase (pacote core) para postgres-dumps/core-data.dump
# Requer: pg_dump no PATH
# Env: SOURCE_DATABASE_URL — connection string session pooler :5432 (não commitar)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $env:SOURCE_DATABASE_URL) {
  Write-Error "Defina SOURCE_DATABASE_URL (Postgres Supabase, session pooler :5432)."
}
$OutDir = Join-Path $Root "postgres-dumps"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutFile = Join-Path $OutDir "core-data.dump"

$Manifest = Join-Path $PSScriptRoot "core-data-tables.txt"
$tables = Get-Content $Manifest | ForEach-Object { $_.Trim() } | Where-Object {
  $_ -and -not $_.StartsWith("#")
}
if (-not $tables.Count) { Write-Error "Nenhuma tabela em core-data-tables.txt" }

$tableArgs = $tables | ForEach-Object { "-t"; $_ }

Write-Host "A exportar $($tables.Count) tabelas para $OutFile ..."
& pg_dump $env:SOURCE_DATABASE_URL `
  --format=custom `
  --data-only `
  --no-owner `
  --no-privileges `
  @tableArgs `
  -f $OutFile

Write-Host "OK: $OutFile"
