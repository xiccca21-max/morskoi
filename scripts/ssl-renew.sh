#!/bin/bash
# Ручное продление SSL (обычно cron делает сам)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/naval-clash}"
DOMAIN="${1:-}"

cd "$APP_DIR"

if [[ -z "$DOMAIN" ]]; then
  DOMAIN=$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -1)
fi

if [[ -z "$DOMAIN" ]]; then
  echo "Укажи домен: $0 game.navalclash.ru"
  exit 1
fi

certbot renew
cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" nginx/certs/
cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" nginx/certs/
docker compose -f docker-compose.prod.yml restart nginx
echo "SSL обновлён для ${DOMAIN}"
