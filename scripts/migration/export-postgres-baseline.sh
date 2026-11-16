#!/usr/bin/env sh
# Exporta schema (e opcionalmente dados core) do Postgres fonte (produção Easypanel).
# Env: SOURCE_DATABASE_URL (session :5432)
# Uso: ./scripts/migration/export-postgres-baseline.sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${POSTGRES_BASELINE_OUT:-$ROOT/postgres-dumps}"
STAMP="$(date +%Y%m%d)"
SCHEMA_DUMP="$OUT_DIR/pms-baseline-${STAMP}.schema.dump"
MANIFEST="$OUT_DIR/baseline-manifest.json"
SCHEMAS="${BASELINE_SCHEMAS:-public,auth}"

if [ -z "${SOURCE_DATABASE_URL:-}" ]; then
  echo "Defina SOURCE_DATABASE_URL (Postgres produção, :5432)." >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Instale postgresql-client (pg_dump)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
schema_args=""
for s in $(echo "$SCHEMAS" | tr ',' ' '); do
  s=$(echo "$s" | tr -d ' ')
  [ -n "$s" ] || continue
  schema_args="$schema_args -n $s"
done

echo "=== Schema-only → $SCHEMA_DUMP ==="
# shellcheck disable=SC2086
pg_dump "$SOURCE_DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --format=custom \
  $schema_args \
  -f "$SCHEMA_DUMP"

DATA_DUMP=""
if [ "${INCLUDE_CORE_DATA:-false}" = "true" ]; then
  DATA_DUMP="$OUT_DIR/pms-baseline-${STAMP}.core-data.dump"
  manifest_tables="$ROOT/scripts/migration/core-data-tables.txt"
  table_args=""
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$line" in ""|"#"*) continue ;; esac
    table_args="$table_args -t $line"
  done < "$manifest_tables"
  echo "=== Data-only (core) → $DATA_DUMP ==="
  # shellcheck disable=SC2086
  pg_dump "$SOURCE_DATABASE_URL" \
    --data-only \
    --no-owner \
    --no-privileges \
    --format=custom \
    $table_args \
    -f "$DATA_DUMP"
fi

pg_version="$(psql "$SOURCE_DATABASE_URL" -tAc 'SHOW server_version;' 2>/dev/null | tr -d ' ' || echo unknown)"

cat > "$MANIFEST" <<EOF
{
  "exported_at": "$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)",
  "stamp": "$STAMP",
  "schemas": "$SCHEMAS",
  "schema_dump": "$(basename "$SCHEMA_DUMP")",
  "data_dump": $( [ -n "$DATA_DUMP" ] && echo "\"$(basename "$DATA_DUMP)\"" || echo "null" ),
  "pg_server_version": "$pg_version",
  "note": "Não commitar dumps. Atualizar após mudanças de schema em produção."
}
EOF

echo "OK: $SCHEMA_DUMP"
echo "Manifest: $MANIFEST"