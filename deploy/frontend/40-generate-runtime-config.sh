#!/bin/sh
set -eu

HTML_ROOT="${NGINX_HTML_ROOT:-/usr/share/nginx/html}"
OUT="${HTML_ROOT}/runtime-config.js"

API_URL="${VITE_PMS_API_URL:-${PMS_API_URL:-}}"
APP_URL="${VITE_APP_URL:-${PMS_APP_URL:-}}"
WEB_CHECKIN_HOST="${WEB_CHECKIN_PUBLIC_HOST:-${VITE_WEB_CHECKIN_PUBLIC_HOST:-}}"

escape_js() {
  printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\'/g"
}

API_ESC=$(escape_js "$API_URL")
APP_ESC=$(escape_js "$APP_URL")
WEB_CHECKIN_ESC=$(escape_js "$WEB_CHECKIN_HOST")

if [ -n "$WEB_CHECKIN_HOST" ]; then
  WEB_CHECKIN_LINE="  webCheckinPublicHost: '${WEB_CHECKIN_ESC}',"
else
  WEB_CHECKIN_LINE=""
fi

cat > "$OUT" <<EOF
window.__RUNTIME_CONFIG__ = {
  pmsApiUrl: '${API_ESC}',
  appUrl: '${APP_ESC}',
${WEB_CHECKIN_LINE}
};
EOF

echo "runtime-config.js gerado (pmsApiUrl=${API_URL:-<vazio>}, webCheckinPublicHost=${WEB_CHECKIN_HOST:-<vazio>})"
