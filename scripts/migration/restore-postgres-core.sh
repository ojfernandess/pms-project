#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${TARGET_DATABASE_URL:?Defina TARGET_DATABASE_URL}"
DUMP="$ROOT/postgres-dumps/core-data.dump"
DIR="$(dirname "$0")"

[[ -f "$DUMP" ]] || { echo "Falta $DUMP — corra dump-supabase-core.sh"; exit 1; }

psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DIR/bootstrap-target-postgres.sql"
pg_restore -d "$TARGET_DATABASE_URL" --data-only --disable-triggers --no-owner --no-privileges -v "$DUMP"
psql "$TARGET_DATABASE_URL" -f "$DIR/verify-core-data.sql"
echo "Restore concluído."
