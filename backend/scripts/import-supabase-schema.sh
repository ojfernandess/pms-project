#!/bin/sh
# Replica DDL completo (tabelas, tipos, funções/RPC, índices) Supabase → Postgres destino.
# Requer postgresql-client na imagem (pg_dump/pg_restore/psql).
set -eu

mode="${APP_IMPORT_SUPABASE_SCHEMA:-}"
case "$mode" in
  ""|false|0|skip|no) exit 0 ;;
esac

if [ -z "${SUPABASE_DATABASE_URL:-}" ]; then
  echo "APP_IMPORT_SUPABASE_SCHEMA=$mode mas SUPABASE_DATABASE_URL não está definida." >&2
  exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "APP_IMPORT_SUPABASE_SCHEMA=$mode mas DATABASE_URL não está definida." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_dump/pg_restore não encontrados. Rebuild da imagem backend com postgresql-client." >&2
  exit 1
fi

marker="${IMPORT_SCHEMA_STATE_FILE:-/app/storage/.supabase-schema-imported}"
if [ "$mode" = "once" ] || [ "$mode" = "true" ]; then
  if [ -f "$marker" ]; then
    echo "Schema já importado ($marker). Use APP_IMPORT_SUPABASE_SCHEMA=force para repetir."
    exit 0
  fi
fi

bootstrap="${IMPORT_BOOTSTRAP_SQL:-/app/scripts/migration/bootstrap-target-postgres.sql}"
if [ -f "$bootstrap" ] && [ "${APP_IMPORT_RUN_BOOTSTRAP:-true}" != "false" ]; then
  echo "Bootstrap destino..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$bootstrap"
fi

schemas="${IMPORT_SCHEMA_NAMES:-public,auth}"
schema_args=""
for s in $(echo "$schemas" | tr ',' ' '); do
  s=$(echo "$s" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -n "$s" ] || continue
  schema_args="$schema_args -n $s"
done

tmp_dump="/tmp/pms-schema.dump"
echo "=== pg_dump schema-only (schemas: $schemas) ==="
# shellcheck disable=SC2086
pg_dump "$SUPABASE_DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --format=custom \
  $schema_args \
  -f "$tmp_dump"

echo "=== pg_restore schema no destino ==="
set +e
pg_restore -d "$DATABASE_URL" --no-owner --no-privileges "$tmp_dump" 2>&1 | tee /tmp/pg_restore_schema.log
restore_rc=$?
set -e
if [ "$restore_rc" -ne 0 ]; then
  echo "WARN: pg_restore terminou com código $restore_rc (ver /tmp/pg_restore_schema.log)." >&2
fi

if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'cancel_expired_preregistrations' LIMIT 1" | grep -q 1; then
  echo "WARN: função public.cancel_expired_preregistrations ausente — repita APP_IMPORT_SUPABASE_SCHEMA=force num DB limpo ou aplique migrações SQL." >&2
fi

grants="${IMPORT_GRANTS_SQL:-/app/scripts/migration/grant-app-roles.sql}"
if [ -f "$grants" ]; then
  echo "GRANTs pós-schema..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$grants"
fi

mkdir -p "$(dirname "$marker")"
date -Iseconds > "$marker"
echo "Schema importado. Marcador: $marker"
rm -f "$tmp_dump"