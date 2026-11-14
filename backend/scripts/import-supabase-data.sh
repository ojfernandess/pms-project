#!/bin/sh
set -eu

mode="${APP_IMPORT_SUPABASE_DATA:-}"
case "$mode" in
  ""|false|0|skip|no) exit 0 ;;
esac

if [ -z "${SUPABASE_DATABASE_URL:-}" ]; then
  echo "APP_IMPORT_SUPABASE_DATA=$mode mas SUPABASE_DATABASE_URL não está definida." >&2
  exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "APP_IMPORT_SUPABASE_DATA=$mode mas DATABASE_URL (destino) não está definida." >&2
  exit 1
fi

copy_mode="${COPY_MODE:-node}"
echo "=== Supabase data import (APP_IMPORT_SUPABASE_DATA=$mode, COPY_MODE=$copy_mode) ==="

if [ "$copy_mode" = "pg" ]; then
  if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
    echo "COPY_MODE=pg exige pg_dump/pg_restore na imagem. Use COPY_MODE=node ou instale postgresql-client." >&2
    exit 1
  fi
  tables_file="${IMPORT_TABLES_FILE:-/app/scripts/migration/core-data-tables.txt}"
  if [ ! -f "$tables_file" ]; then
    echo "Ficheiro de tabelas não encontrado: $tables_file" >&2
    exit 1
  fi
  tmp_dump="/tmp/pms-core.dump"
  table_args=""
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$line" in
      ""|"#"*) continue ;;
    esac
    schema=$(echo "$line" | cut -d. -f1)
    tbl=$(echo "$line" | cut -d. -f2-)
    table_args="$table_args -t ${schema}.${tbl}"
  done < "$tables_file"
  # shellcheck disable=SC2086
  pg_dump "$SUPABASE_DATABASE_URL" --format=custom --data-only --no-owner --no-privileges $table_args -f "$tmp_dump"
  bootstrap="${IMPORT_BOOTSTRAP_SQL:-/app/scripts/migration/bootstrap-target-postgres.sql}"
  if [ -f "$bootstrap" ] && [ "${APP_IMPORT_RUN_BOOTSTRAP:-true}" != "false" ]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$bootstrap"
  fi
  pg_restore -d "$DATABASE_URL" --data-only --disable-triggers --no-owner --no-privileges "$tmp_dump"
  marker="${IMPORT_STATE_FILE:-/app/storage/.supabase-data-imported}"
  mkdir -p "$(dirname "$marker")"
  date -Iseconds > "$marker"
  echo "Import pg_restore concluído."
else
  if ! node /app/scripts/import-supabase-data.mjs; then
    if [ "${APP_IMPORT_STRICT:-false}" = "true" ]; then
      exit 1
    fi
    echo "WARN: import falhou; API sobe na mesma (APP_IMPORT_STRICT=true para abortar)." >&2
  fi
fi