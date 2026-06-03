#!/bin/bash
set -e
CHROME=$(docker run --rm mcr.microsoft.com/playwright:v1.49.1-jammy bash -c 'ls -d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -1' | tr -d '\r')
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
HTML=$(docker run --rm --network host mcr.microsoft.com/playwright:v1.49.1-jammy bash -c "
  \"$CHROME\" --headless=new --no-sandbox --disable-gpu --user-agent='$UA' \
    --virtual-time-budget=30000 --dump-dom https://game.navalclash.ru/ 2>/dev/null
")
if echo "$HTML" | grep -q 'class="boot"'; then
  echo "FAIL iPhone UA: boot still visible"
  exit 1
fi
echo "OK iPhone UA: React mounted"
curl -sS https://game.navalclash.ru/ | grep -o 'app\.[^"]*\.js' | head -1
