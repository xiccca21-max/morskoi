#!/bin/bash
set -e
cd /opt/naval-clash
BUNDLE=$(docker compose -f docker-compose.prod.yml exec -T app wget -qO- http://127.0.0.1:4000/ | grep -o 'index-[^"]*\.js' | head -1)
echo "bundle=$BUNDLE"
docker compose -f docker-compose.prod.yml exec -T app wget -S -qO /dev/null "http://127.0.0.1:4000/assets/$BUNDLE" 2>&1 | head -3
curl -sS -k -o /dev/null -w "nginx %{http_code} %{size_download}\n" -H "Host: game.navalclash.ru" "https://127.0.0.1/assets/$BUNDLE"
curl -sS -o /dev/null -w "cf %{http_code} %{size_download}\n" "https://game.navalclash.ru/assets/$BUNDLE"
curl -sS -o /dev/null -w "old404 %{http_code}\n" "https://game.navalclash.ru/assets/index-BSmX1UvV.js"
curl -sS https://game.navalclash.ru/ | grep -c crossorigin || echo "no crossorigin"
