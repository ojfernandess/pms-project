#!/bin/sh
set -eu

HTML_ROOT="${NGINX_HTML_ROOT:-/usr/share/nginx/html}"
OUT="${HTML_ROOT}/runtime-config.js"

# VITE_* no estágio final da imagem vêm do Environment do compose (não do build).
# API: subdomínio dedicado (myapi.*) — não usar PUBLIC_APP_URL como fallback da API
API_URL="${VITE_PMS_API_URL:-${PMS_API_URL:-}}"
APP_URL="${VITE_APP_URL:-${PMS_APP_URL:-${PUBLIC_APP_URL:-${SITE_URL:-}}}}"

WEB_CHECKIN_HOST="${WEB_CHECKIN_PUBLIC_HOST:-${VITE_WEB_CHECKIN_PUBLIC_HOST:-}}"
WEB_CHECKIN_URL="${WEB_CHECKIN_PUBLIC_URL:-}"

host_from_url() {
  printf '%s' "$1" \
    | sed -e 's|^[^:]*://||' -e 's|/.*||' -e 's|:.*||' \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/^www\.//'
}

if [ -z "$WEB_CHECKIN_HOST" ] && [ -n "$WEB_CHECKIN_URL" ]; then
  WEB_CHECKIN_HOST=$(host_from_url "$WEB_CHECKIN_URL")
fi

# Produção (Traefik/HTTPS): evita pmsApiUrl http:// no runtime-config
force_https_url() {
  url="$1"
  if [ -z "$url" ]; then
    printf '%s' "$url"
    return
  fi
  case "$url" in
    http://*) printf 'https://%s' "${url#http://}" ;;
    https://*) printf '%s' "$url" ;;
    *) printf 'https://%s' "$url" ;;
  esac
}

API_URL=$(force_https_url "$API_URL")
APP_URL=$(force_https_url "$APP_URL")
WEB_CHECKIN_URL=$(force_https_url "$WEB_CHECKIN_URL")

escape_js() {
  printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\'/g"
}

# Monta runtime-config.js (chaves vazias omitidas; browser preenche via index.html se necessário).
{
  echo 'window.__RUNTIME_CONFIG__ = window.__RUNTIME_CONFIG__ || {'
  first=1
  append_field() {
    key="$1"
    val="$2"
    if [ -n "$val" ]; then
      esc=$(escape_js "$val")
      if [ "$first" -eq 1 ]; then
        first=0
      else
        echo ','
      fi
      printf '  %s: '\''%s'\''' "$key" "$esc"
    fi
  }
  append_field 'pmsApiUrl' "$API_URL"
  append_field 'appUrl' "$APP_URL"
  append_field 'webCheckinPublicHost' "$WEB_CHECKIN_HOST"
  append_field 'webCheckinPublicUrl' "$WEB_CHECKIN_URL"
  echo ''
  echo '};'
} > "$OUT"

if ! grep -q pmsApiUrl "$OUT" 2>/dev/null; then
  echo "AVISO: runtime-config.js sem pmsApiUrl — confira Environment do serviço frontend no Dokploy (PUBLIC_APP_URL, VITE_PMS_API_URL)" >&2
fi

echo "runtime-config.js gerado (pmsApiUrl=${API_URL:-<vazio>}, appUrl=${APP_URL:-<vazio>}, webCheckinPublicHost=${WEB_CHECKIN_HOST:-<vazio>})"