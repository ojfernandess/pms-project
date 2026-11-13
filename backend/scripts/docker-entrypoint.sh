#!/bin/sh
set -eu

if [ "${PRISMA_MIGRATE_ON_START:-false}" = "true" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (set PRISMA_MIGRATE_ON_START=true for empty Postgres or after baseline)."
fi

exec node dist/main.js
