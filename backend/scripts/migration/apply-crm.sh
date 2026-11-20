#!/bin/sh
# Aplica StayOS CRM (etapas 1–6) no Postgres de produção/deploy.
# Fonte: backend/prisma/migrations/20261120*crm* — NÃO usar supabase db push.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
MIG_DIR="$SCRIPT_DIR/crm"

PSQL_URL="${1:-${PSQL_DATABASE_URL:-${DATABASE_URL:-}}}"
if [ -z "$PSQL_URL" ]; then
  echo "apply-crm: DATABASE_URL ausente" >&2
  exit 1
fi

case "$PSQL_URL" in
  *supabase.co*|*supabase.com*)
    echo "apply-crm: recusado — DATABASE_URL aponta para Supabase. Use o Postgres do PMS (Easypanel/Dokploy)." >&2
    exit 1
    ;;
esac

if [ ! -d "$MIG_DIR" ]; then
  echo "apply-crm: diretório $MIG_DIR não encontrado" >&2
  exit 1
fi

for f in \
  20261120140000_crm_foundation.sql \
  20261120150000_crm_pipelines_deals.sql \
  20261120160000_crm_campaigns_segments.sql \
  20261120170000_crm_automations.sql \
  20261120180000_crm_advanced.sql \
  20261120181000_crm_role_permissions.sql \
  20261120182000_crm_rpcs.sql
do
  path="$MIG_DIR/$f"
  if [ ! -f "$path" ]; then
    echo "apply-crm: ficheiro em falta $f" >&2
    exit 1
  fi
  echo "Applying CRM: $f"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$path"
done

echo "CRM migrations applied on Postgres."
