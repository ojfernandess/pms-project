#!/bin/sh
# Aplica pgcrypto + RPCs de Web Check-in (use no terminal do container backend, cwd irrelevante).
set -eu

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não está definida neste container." >&2
  echo "  Use o Terminal do serviço *backend* no Dokploy (não um shell aleatório sem env)." >&2
  exit 1
fi

PSQL_DATABASE_URL="$(node ./scripts/print-database-url-libpq.mjs)"
if [ -z "$PSQL_DATABASE_URL" ]; then
  echo "ERRO: não foi possível derivar URL para psql a partir de DATABASE_URL." >&2
  exit 1
fi

echo "=== pgcrypto-bootstrap.sql ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/pgcrypto-bootstrap.sql

echo "=== guest_verify_password_hotfix.sql ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/rpc/guest_verify_password_hotfix.sql

echo "=== guest_account_rpcs.sql ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/rpc/guest_account_rpcs.sql

echo "=== grant-web-checkin-anon.sql ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/grant-web-checkin-anon.sql

echo "=== web-checkin-anon-rls.sql ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=0 -f ./scripts/migration/web-checkin-anon-rls.sql

echo "=== verificar crypt ==="
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'crypt';"

echo "OK: Web Check-in DB pronto."