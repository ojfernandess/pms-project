#!/bin/sh
# Aplica reestruturação AR/AP no Postgres (deploy). Origem: supabase/migrations/202511181*.sql
# Uso: psql via DATABASE_URL — não usar supabase db push.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
MIG_DIR="$SCRIPT_DIR/financial_ar_ap"

PSQL_URL="${1:-${PSQL_DATABASE_URL:-${DATABASE_URL:-}}}"
if [ -z "$PSQL_URL" ]; then
  echo "apply-financial-ar-ap: DATABASE_URL ausente" >&2
  exit 1
fi

if [ ! -d "$MIG_DIR" ]; then
  echo "apply-financial-ar-ap: diretório $MIG_DIR não encontrado" >&2
  exit 1
fi

# Ordem obrigatória (fases 1–6)
for f in \
  20251118150000_financial_receivable_reservation_sync_v2.sql \
  20251118160000_financial_title_settlements_phase2.sql \
  20251118170000_financial_suppliers_phase3.sql \
  20251118180000_financial_receivable_phase4.sql \
  20251118190000_financial_cash_flow_phase5.sql \
  20251118195000_financial_legacy_migration_phase6.sql
do
  path="$MIG_DIR/$f"
  if [ ! -f "$path" ]; then
    echo "apply-financial-ar-ap: ficheiro em falta $f" >&2
    exit 1
  fi
  echo "Applying financial AR/AP: $f"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$path"
done

echo "Financial AR/AP migrations applied."