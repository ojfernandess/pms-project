#!/bin/sh
# Aplica RPCs versionadas no repositório (sem precisar de SUPABASE_DATABASE_URL).
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

apply_one() {
  f=$1
  path="$rpc_dir/$f"
  if [ ! -f "$path" ]; then
    echo "WARN: falta $path" >&2
    return
  fi
  echo "  psql -f $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$path" || true
}

echo "=== Aplicando RPCs em $rpc_dir ==="
order_file="$rpc_dir/apply-order.txt"
if [ -f "$order_file" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$line" in ""|"#"*) continue ;; esac
    apply_one "$line"
  done < "$order_file"
else
  for f in "$rpc_dir"/*.sql; do
    [ -f "$f" ] || continue
  apply_one "$(basename "$f")"
  done
fi

for fn in calculate_rate_price cancel_expired_preregistrations sync_rate_inventory_from_reservations; do
  if psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${fn}' LIMIT 1" | grep -q 1; then
    echo "OK: public.${fn} presente."
  else
    echo "WARN: public.${fn} ausente." >&2
  fi
done

mkdir -p "$(dirname "$marker")"
date -Iseconds > "$marker"
echo "Bundled RPCs concluído. Marcador: $marker"