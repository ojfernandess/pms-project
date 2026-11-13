#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${SOURCE_DATABASE_URL:?Defina SOURCE_DATABASE_URL}"
OUT_DIR="$ROOT/postgres-dumps"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/core-data.dump"
MANIFEST="$(dirname "$0")/core-data-tables.txt"

mapfile -t TABLES < <(grep -v '^#' "$MANIFEST" | grep -v '^[[:space:]]*$' || true)
ARGS=()
for t in "${TABLES[@]}"; do ARGS+=(-t "$t"); done

echo "Exportando ${#TABLES[@]} tabelas..."
pg_dump "$SOURCE_DATABASE_URL" \
  --format=custom \
  --data-only \
  --no-owner \
  --no-privileges \
  "${ARGS[@]}" \
  -f "$OUT_FILE"
echo "OK: $OUT_FILE"
