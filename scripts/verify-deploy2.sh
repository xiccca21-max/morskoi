#!/bin/bash
set -e
sleep 5
echo "=== old bundle (must be 404) ==="
curl -sS -I https://game.navalclash.ru/assets/index-BSmX1UvV.js | head -3
echo "=== new bundle ==="
curl -sS -I https://game.navalclash.ru/assets/index-Dy6CFYOB.js | head -3
echo "=== html ==="
HTML=$(curl -sS https://game.navalclash.ru/)
echo "crossorigin_count=$(echo "$HTML" | grep -c crossorigin || true)"
echo "$HTML" | grep -o 'index-[^"]*\.js' | head -1
echo "=== config ==="
curl -sS -o /dev/null -w "config %{http_code}\n" https://game.navalclash.ru/api/config
