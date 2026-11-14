#!/bin/sh
set -eu

HTML_ROOT="${NGINX_HTML_ROOT:-/usr/share/nginx/html}"
OUT="${HTML_ROOT}/runtime-config.js"

API_URL="${VITE_PMS_API_URL:-${PMS_API_URL:-}}"
APP_URL="${VITE_APP_URL:-${PMS_APP_URL:-}}"

escape_js() {
  printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\'/g"
}

API_ESC=$(escape_js "$API_URL")
APP_ESC=$(escape_js "$APP_URL")

cat > "$OUT" <<EOF
window.__RUNTIME_CONFIG__ = {
  pmsApiUrl: '${API_ESC}',
  appUrl: '${APP_ESC}',
};
EOF

echo "runtime-config.js gerado (pmsApiUrl=${API_URL:-<vazio>})"
