#!/bin/sh
set -eu

# Easypanel costuma manter o CMD da imagem; use PMS_RUN_MODE=worker no serviço worker.
if [ "${PMS_MIGRATION_COMPLETE:-false}" = "true" ]; then
  echo "PMS_MIGRATION_COMPLETE=true — imports Supabase/schema desativados neste arranque."
fi

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

# auth.uid() / auth.role() para RLS e RPCs SECURITY DEFINER (Postgres sem stack Supabase)
if [ -n "${DATABASE_URL:-}" ] && [ -f ./scripts/migration/auth-compat.sql ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f ./scripts/migration/auth-compat.sql >/dev/null 2>&1 \
    || echo "WARN: auth-compat.sql falhou" >&2
fi

# Antes do import longo: calculate_rate_price (evita 42883 se a API subir durante force import)
if [ -f ./scripts/ensure-bundled-rpcs.mjs ]; then
  node ./scripts/ensure-bundled-rpcs.mjs || echo "WARN: ensure-bundled-rpcs falhou" >&2
else
  echo "WARN: ensure-bundled-rpcs.mjs ausente — faça rebuild da imagem (branch PMS-Backend >= 96ad39a)." >&2
fi

# DDL completo (tabelas + RPCs): APP_IMPORT_SUPABASE_SCHEMA=once|force (antes dos dados)
if [ -f ./scripts/import-supabase-schema.sh ]; then
  ./scripts/import-supabase-schema.sh
fi

# Dados: APP_IMPORT_SUPABASE_DATA=once|force (+ APP_IMPORT_DISCOVER_TABLES=public,auth após schema)
if [ -f ./scripts/import-supabase-data.sh ]; then
  if [ "${PMS_IMPORT_IN_BACKGROUND:-false}" = "true" ]; then
    echo "Import de dados em background (PMS_IMPORT_IN_BACKGROUND=true); API sobe em seguida."
    ./scripts/import-supabase-data.sh &
  else
    ./scripts/import-supabase-data.sh
  fi
fi

# Postgres próprio: GRANTs para roles authenticated/anon (correge 42501 permission denied)
if [ "${APP_RUN_DB_GRANTS:-false}" = "true" ] && [ -f ./scripts/apply-db-grants.mjs ]; then
  node ./scripts/apply-db-grants.mjs || echo "WARN: apply-db-grants falhou" >&2
fi

# FKs (embeds reservations->rooms): cópia a partir da origem se o schema veio sem constraints
if [ "${APP_IMPORT_SYNC_FKS:-false}" = "true" ] && [ -f ./scripts/sync-foreign-keys-from-supabase.mjs ]; then
  node ./scripts/sync-foreign-keys-from-supabase.mjs || echo "WARN: sync FKs falhou" >&2
fi

# Funções SQL/RPC (calculate_rate_price, cancel_expired_preregistrations, ...)
if [ "${APP_IMPORT_SYNC_FUNCTIONS:-false}" = "true" ] && [ -f ./scripts/sync-public-functions-from-supabase.mjs ]; then
  node ./scripts/sync-public-functions-from-supabase.mjs || echo "WARN: sync functions falhou" >&2
fi

# Reaplica RPC após import/TRUNCATE (import longo + réplicas Easypanel)
if [ -f ./scripts/ensure-bundled-rpcs.mjs ]; then
  APP_APPLY_BUNDLED_RPCS="${APP_APPLY_BUNDLED_RPCS:-auto}" node ./scripts/ensure-bundled-rpcs.mjs || echo "WARN: ensure-bundled-rpcs (pós-import) falhou" >&2
fi

exec node dist/main.js
