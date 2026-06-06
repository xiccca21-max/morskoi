#!/bin/bash
# Меняет URL мини-аппа в боте на sslip (минуя CF и 302 без hash).
set -euo pipefail
cd "$(dirname "$0")/.."
NEW_URL="${1:-https://185-246-217-2.sslip.io}"
source .env
sed -i "s|^TELEGRAM_WEBAPP_URL=.*|TELEGRAM_WEBAPP_URL=${NEW_URL}|" .env
export TELEGRAM_WEBAPP_URL="$NEW_URL"
curl -s -X POST "${TELEGRAM_API_ROOT:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Начать играть\",\"web_app\":{\"url\":\"${NEW_URL}\"}}}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('setChatMenuButton:', r.get('ok'), r.get('description',''))"
docker compose -f docker-compose.prod.yml up -d app
echo "TELEGRAM_WEBAPP_URL=${NEW_URL}"
