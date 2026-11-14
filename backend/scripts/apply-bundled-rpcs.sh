#!/bin/sh
# Aplica RPCs versionadas no repositório (sem precisar de SUPABASE_DATABASE_URL).
# Corrige 42883 em /rates/quote quando o pg_restore não trouxe calculate_rate_price.
set -eu

mode="${APP_APPLY_BUNDLED_RPCS:-}"
case "$mode" in
  ""|false|0|skip|no) exit 0 ;;
esac

if [ -z "${DATABASE_URL:-}" ]; then
  echo "APP_APPLY_BUNDLED_RPCS=$mode mas DATABASE_URL não está definida." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql não encontrado na imagem." >&2
  exit 1
fi

marker="${BUNDLED_RPCS_STATE_FILE:-/app/storage/.bundled-rpcs-applied}"
if [ "$mode" = "once" ] || [ "$mode" = "true" ]; then
  if [ -f "$marker" ]; then
    echo "Bundled RPCs já aplicados ($marker). Use APP_APPLY_BUNDLED_RPCS=force para repetir."
    exit 0
  fi
fi

rpc_dir="${BUNDLED_RPCS_DIR:-/app/scripts/migration/rpc}"
if [ ! -d "$rpc_dir" ]; then
  echo "Diretório não encontrado: $rpc_dir" >&2
  exit 1
fi

echo "=== Aplicando RPCs em $rpc_dir ==="
for f in calculate_rate_price.sql grant_calculate_rate_price.sql; do
  path="$rpc_dir/$f"
  if [ ! -f "$path" ]; then
    echo "WARN: falta $path" >&2
    continue
  fi
  echo "  psql -f $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$path" || true
done

if psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'calculate_rate_price' LIMIT 1" | grep -q 1; then
  echo "OK: public.calculate_rate_price presente."
else
  echo "ERROR: calculate_rate_price ainda ausente após bundled RPCs." >&2
  if [ "${APP_APPLY_BUNDLED_RPCS_STRICT:-false}" = "true" ]; then
    exit 1
  fi
fi

mkdir -p "$(dirname "$marker")"
date -Iseconds > "$marker"
echo "Bundled RPCs concluído. Marcador: $marker"