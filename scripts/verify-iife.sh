#!/bin/bash
set -e
sleep 4
HTML=$(curl -sS https://game.navalclash.ru/)
echo "$HTML" | grep -E 'script|stylesheet|telegram' | head -10
echo "---"
echo "module_count=$(echo "$HTML" | grep -c 'type="module"' || true)"
echo "app_script=$(echo "$HTML" | grep -o 'app\.[^"]*\.js' | head -1)"
BUNDLE=$(echo "$HTML" | grep -o 'app\.[^"]*\.js' | head -1)
curl -sS -o /dev/null -w "js %{http_code} %{size_download}\n" "https://game.navalclash.ru/assets/$BUNDLE"
curl -sS -o /dev/null -w "tg %{http_code}\n" https://game.navalclash.ru/telegram-web-app.js
curl -sS -o /dev/null -w "config %{http_code}\n" https://game.navalclash.ru/api/config
docker compose -f /opt/naval-clash/docker-compose.prod.yml exec -T app wget -qO- http://127.0.0.1:4000/health
