#!/bin/bash
set -e
CHROME=$(docker run --rm mcr.microsoft.com/playwright:v1.49.1-jammy bash -c 'ls -d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -1' | tr -d '\r')
for UA in \
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
do
  HTML=$(docker run --rm --network host mcr.microsoft.com/playwright:v1.49.1-jammy bash -c "
    \"$CHROME\" --headless=new --no-sandbox --user-agent='$UA' \
      --virtual-time-budget=35000 --dump-dom https://game.navalclash.ru/ 2>/dev/null
  ")
  if echo "$HTML" | grep -qiE 'Не удалось войти|только в Telegram|В бой|matchmaking|wallet'; then
    echo "OK UA=${UA:0:40}... React UI"
  elif echo "$HTML" | grep -q 'id="root"></div>'; then
    echo "FAIL UA=${UA:0:40}... root empty (JS not ran)"
    exit 1
  else
    echo "OK UA=${UA:0:40}... root has content"
  fi
done
