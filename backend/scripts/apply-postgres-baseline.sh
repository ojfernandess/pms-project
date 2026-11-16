#!/bin/sh
# Aplica dump schema-only (baseline produção) em DATABASE_URL vazio.
# APP_APPLY_POSTGRES_BASELINE=once|force
# POSTGRES_BASELINE_FILE=/caminho/pms-baseline.schema.dump
set -eu

mode="${APP_APPLY_POSTGRES_BASELINE:-}"
case "$mode" in
  ""|false|0|skip|no) exit 0 ;;
esac

if [ -z "${DATABASE_URL:-}" ]; then
  echo "APP_APPLY_POSTGRES_BASELINE=$mode mas DATABASE_URL não está definida." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "pg_restore/psql não encontrados na imagem." >&2
  exit 1
fi

marker="${POSTGRES_BASELINE_STATE_FILE:-/app/storage/.postgres-baseline-applied}"
if [ "$mode" = "once" ] || [ "$mode" = "true" ]; then
  if [ -f "$marker" ]; then
    echo "Baseline já aplicado ($marker). Use APP_APPLY_POSTGRES_BASELINE=force para repetir."
    exit 0
  fi
fi

dump="${POSTGRES_BASELINE_FILE:-}"
if [ -z "$dump" ]; then
  for candidate in \
    /app/postgres-baseline/pms-baseline.schema.dump \
    /app/storage/baseline/pms-baseline.schema.dump \
    /app/postgres-baseline/*.schema.dump; do
    if [ -f "$candidate" ]; then
      dump="$candidate"
      break
    fi
  done
fi

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "Baseline não encontrado. Defina POSTGRES_BASELINE_FILE ou monte dump em /app/storage/baseline/." >&2
  exit 1
fi

bootstrap="${IMPORT_BOOTSTRAP_SQL:-/app/scripts/migration/bootstrap-target-postgres.sql}"
if [ -f "$bootstrap" ] && [ "${APP_IMPORT_RUN_BOOTSTRAP:-true}" != "false" ]; then
  echo "Bootstrap antes do baseline..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$bootstrap"
fi

echo "=== pg_restore baseline: $dump ==="
set +e
pg_restore -d "$DATABASE_URL" --no-owner --no-privileges "$dump" 2>&1 | tee /tmp/pg_restore_baseline.log
restore_rc=$?
set -e
if [ "$restore_rc" -ne 0 ]; then
  echo "WARN: pg_restore baseline código $restore_rc (ver /tmp/pg_restore_baseline.log)." >&2
fi

grants="${IMPORT_GRANTS_SQL:-/app/scripts/migration/grant-app-roles.sql}"
if [ -f "$grants" ] && [ "${APP_RUN_DB_GRANTS:-true}" != "false" ]; then
  echo "GRANTs pós-baseline..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$grants" || true
fi

mkdir -p "$(dirname "$marker")"
date -Iseconds > "$marker" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ > "$marker"
echo "Baseline aplicado. Marcador: $marker"