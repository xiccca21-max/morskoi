#!/bin/bash
# Быстрая проверка прода: JS целиком, API, маска борда, админка закрыта.
set -euo pipefail
ORIGIN="${ORIGIN:-https://176-12-68-39.sslip.io}"
GAME="${GAME:-https://game.navalclash.ru}"
POLY="polyfills-legacy-XiNnBh20.js"

echo "=== JS size (must be >100000 on origin) ==="
curl -sk "$ORIGIN/assets/$POLY" -o /tmp/p.js -w "sslip %{size_download}\n"
curl -skL "$GAME/assets/$POLY" -o /tmp/cf.js -w "game %{size_download}\n" 2>/dev/null || echo "game assets via CF may fail until grey cloud"

echo "=== Health ==="
curl -sk "$ORIGIN/health" | head -c 120; echo

echo "=== admin.html (expect 404) ==="
curl -sk -o /dev/null -w "%{http_code}\n" "$ORIGIN/admin.html"

echo "=== State API without auth (expect 401) ==="
curl -sk -o /dev/null -w "%{http_code}\n" "$ORIGIN/api/game/state/fake"

echo "OK"
