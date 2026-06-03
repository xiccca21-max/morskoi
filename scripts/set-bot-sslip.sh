#!/bin/bash
set -euo pipefail
cd /opt/naval-clash
NEW_URL="https://176-12-68-39.sslip.io"
sed -i "s|^TELEGRAM_WEBAPP_URL=.*|TELEGRAM_WEBAPP_URL=${NEW_URL}|" .env
set -a
source .env
set +a
curl -s -X POST "${TELEGRAM_API_ROOT}/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Начать играть\",\"web_app\":{\"url\":\"${NEW_URL}\"}}}"
echo
docker compose -f docker-compose.prod.yml restart app
grep TELEGRAM_WEBAPP_URL .env
