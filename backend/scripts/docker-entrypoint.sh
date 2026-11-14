#!/bin/sh
set -eu

# Easypanel costuma manter o CMD da imagem; use PMS_RUN_MODE=worker no serviço worker.
if [ "${PMS_RUN_MODE:-api}" = "worker" ]; then
  echo "Starting PMS BullMQ worker (PMS_RUN_MODE=worker)..."
  exec node dist/worker.js
fi

if [ "${PRISMA_MIGRATE_ON_START:-false}" = "true" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (set PRISMA_MIGRATE_ON_START=true for empty Postgres or after baseline)."
fi

# DDL completo (tabelas + RPCs): APP_IMPORT_SUPABASE_SCHEMA=once|force (antes dos dados)
if [ -f ./scripts/import-supabase-schema.sh ]; then
  ./scripts/import-supabase-schema.sh
fi

# Dados: APP_IMPORT_SUPABASE_DATA=once|force (+ APP_IMPORT_DISCOVER_TABLES=public,auth após schema)
if [ -f ./scripts/import-supabase-data.sh ]; then
  ./scripts/import-supabase-data.sh
fi

# Postgres próprio: GRANTs para roles authenticated/anon (correge 42501 permission denied)
if [ "${APP_RUN_DB_GRANTS:-false}" = "true" ] && [ -f ./scripts/apply-db-grants.mjs ]; then
  node ./scripts/apply-db-grants.mjs || echo "WARN: apply-db-grants falhou" >&2
fi

exec node dist/main.js
