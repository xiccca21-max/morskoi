#!/bin/bash
# Обход Cloudflare: JS с https://176-12-68-39.sslip.io (прямо на VPS, без прокси CF).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN="176-12-68-39.sslip.io"
WEBROOT="$ROOT/certbot-www"
CERT_DIR="$ROOT/nginx/certs"
NGINX_MAIN="$ROOT/nginx/nginx.prod.conf"
NGINX_SNIP="$ROOT/nginx/nginx.sslip-assets.conf"

mkdir -p "$WEBROOT"

if ! grep -q "sslip-fullchain" "$NGINX_MAIN" 2>/dev/null; then
  if [ -f "$CERT_DIR/sslip-fullchain.pem" ]; then
    echo "Enabling sslip HTTPS server block..."
    sed -i '/server_name _;/i # sslip assets' "$NGINX_MAIN" || true
    # append snippet before last closing brace of http block — use include
    if ! grep -q "nginx.sslip-assets.conf" "$NGINX_MAIN"; then
      sed -i "s|^}$|    include /etc/nginx/sslip-assets.conf;\n}|" "$NGINX_MAIN"
    fi
  fi
fi

if [ ! -f "$CERT_DIR/sslip-fullchain.pem" ]; then
  echo "Requesting Let's Encrypt cert for $DOMAIN ..."
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m admin@navalclash.ru || \
    certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --register-unsafely-without-email --non-interactive --agree-tos
  cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/sslip-fullchain.pem"
  cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/sslip-privkey.pem"
  chmod 644 "$CERT_DIR/sslip-fullchain.pem"
  chmod 600 "$CERT_DIR/sslip-privkey.pem"
  if ! grep -q "sslip-assets.conf" "$NGINX_MAIN"; then
    echo "Add to http {} in nginx.prod.conf: include /etc/nginx/sslip-assets.conf;"
  fi
fi

export VITE_ASSET_ORIGIN="https://${DOMAIN}"
export GIT_SHA="${GIT_SHA:-sslip-$(date +%s)}"
docker compose -f docker-compose.prod.yml up -d --build

echo "Verify: curl -sI https://${DOMAIN}/assets/ (after index deploy)"
