# Aplica CRM no Postgres PMS. Recusa host Supabase.
# Uso: .\apply-crm.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/db"
param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

if ($DatabaseUrl -match "supabase\.(co|com)") {
  Write-Error "DATABASE_URL aponta para Supabase. Use o Postgres do PMS (Easypanel/Dokploy)."
  exit 1
}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$files = @(
  "scripts/migration/crm/20261120140000_crm_foundation.sql",
  "scripts/migration/crm/20261120150000_crm_pipelines_deals.sql",
  "scripts/migration/crm/20261120160000_crm_campaigns_segments.sql",
  "scripts/migration/crm/20261120170000_crm_automations.sql",
  "scripts/migration/crm/20261120180000_crm_advanced.sql",
  "scripts/migration/crm/20261120181000_crm_role_permissions.sql",
  "scripts/migration/crm/20261120182000_crm_rpcs.sql",
  "scripts/migration/crm/20261121110000_crm_booking_paid_automation.sql"
)

$env:DATABASE_URL = $DatabaseUrl
foreach ($f in $files) {
  Write-Host "=== Applying $f ==="
  npx prisma db execute --file $f --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Failed: $f" }
}

Write-Host "CRM migrations applied on Postgres."
