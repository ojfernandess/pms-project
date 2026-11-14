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

exec node dist/main.js
