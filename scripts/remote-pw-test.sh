#!/bin/bash
set -e
HTML=$(curl -sS https://game.navalclash.ru/)
echo "crossorigin=$(echo "$HTML" | grep -c crossorigin || true)"
echo "bundle=$(echo "$HTML" | grep -o 'index-[^"]*\.js' | head -1)"
curl -sS -o /dev/null -w "config=%{http_code}\n" https://game.navalclash.ru/api/config
CHROME=$(docker run --rm mcr.microsoft.com/playwright:v1.49.1-jammy bash -c 'ls -d /ms-playwright/chromium-*/chrome-linux/chrome' | tr -d '\r')
docker run --rm mcr.microsoft.com/playwright:v1.49.1-jammy bash -c "
  \"$CHROME\" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=15000 \
    --dump-dom https://game.navalclash.ru/ 2>/dev/null | grep -E 'boot|Загрузка|api' | head -5 || true
"
