#!/bin/sh
set -eu

on_start="${PRISMA_MIGRATE_ON_START:-false}"
skip="${SKIP_PRISMA_MIGRATE:-false}"

echo "PMS API starting (SKIP_PRISMA_MIGRATE=${skip}, PRISMA_MIGRATE_ON_START=${on_start})"

_should_skip() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true | 1 | yes) return 0 ;;
    *) return 1 ;;
  esac
}

_should_run() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true | 1 | yes) return 0 ;;
    *) return 1 ;;
  esac
}

if _should_skip "$skip"; then
  echo "Skipping prisma migrate deploy (SKIP_PRISMA_MIGRATE is enabled)."
elif _should_run "$on_start"; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (use PRISMA_MIGRATE_ON_START=true only on empty Postgres)."
fi

exec node dist/main.js
