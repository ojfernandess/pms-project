# Exporta baseline do Postgres de produção (schema + opcional dados core).
# $env:SOURCE_DATABASE_URL = "postgresql://...@host:5432/db"
# .\scripts\migration\export-postgres-baseline.ps1
# .\scripts\migration\export-postgres-baseline.ps1 -IncludeCoreData

param([switch]$IncludeCoreData)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$OutDir = if ($env:POSTGRES_BASELINE_OUT) { $env:POSTGRES_BASELINE_OUT } else { Join-Path $Root "postgres-dumps" }
$Stamp = Get-Date -Format "yyyyMMdd"
$Schemas = if ($env:BASELINE_SCHEMAS) { $env:BASELINE_SCHEMAS } else { "public,auth" }

if (-not $env:SOURCE_DATABASE_URL) {
  Write-Error "Defina SOURCE_DATABASE_URL (Postgres produção, porta 5432)."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump não encontrado no PATH."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$SchemaDump = Join-Path $OutDir "pms-baseline-$Stamp.schema.dump"

$schemaArgs = @()
foreach ($s in ($Schemas -split ",")) {
  $s = $s.Trim()
  if ($s) { $schemaArgs += "-n"; $schemaArgs += $s }
}

Write-Host "=== Schema-only → $SchemaDump ==="
& pg_dump $env:SOURCE_DATABASE_URL --schema-only --no-owner --no-privileges --format=custom @schemaArgs -f $SchemaDump

$dataDumpName = $null
if ($IncludeCoreData) {
  $DataDump = Join-Path $OutDir "pms-baseline-$Stamp.core-data.dump"
  $manifest = Join-Path $PSScriptRoot "core-data-tables.txt"
  $tableArgs = @()
  Get-Content $manifest | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
      $tableArgs += "-t"; $tableArgs += $line
    }
  }
  Write-Host "=== Data-only (core) → $DataDump ==="
  & pg_dump $env:SOURCE_DATABASE_URL --data-only --no-owner --no-privileges --format=custom @tableArgs -f $DataDump
  $dataDumpName = [System.IO.Path]::GetFileName($DataDump)
}

$pgVer = "unknown"
try {
  $pgVer = (& psql $env:SOURCE_DATABASE_URL -tAc "SHOW server_version;").Trim()
} catch { }

$manifestObj = @{
  exported_at = (Get-Date).ToString("o")
  stamp = $Stamp
  schemas = $Schemas
  schema_dump = [System.IO.Path]::GetFileName($SchemaDump)
  data_dump = $dataDumpName
  pg_server_version = $pgVer
  note = "Não commitar dumps. Atualizar após mudanças de schema em produção."
}
$Manifest = Join-Path $OutDir "baseline-manifest.json"
$manifestObj | ConvertTo-Json | Set-Content -Path $Manifest -Encoding UTF8

Write-Host "OK: $SchemaDump"
Write-Host "Manifest: $Manifest"