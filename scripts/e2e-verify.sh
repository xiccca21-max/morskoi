#!/bin/bash
set -euo pipefail
BASE="${1:-https://game.navalclash.ru}"
HTML=$(curl -fsS "$BASE/")
echo "=== HTML checks ==="
echo "$HTML" | grep -q 'type="module"' && echo "OK module script" || { echo "FAIL no module"; exit 1; }
echo "$HTML" | grep -c crossorigin | xargs -I{} test {} -eq 0 && echo "OK no crossorigin" || { echo "FAIL crossorigin present"; exit 1; }
BUNDLE=$(echo "$HTML" | grep -oE '/assets/index-[^"]+\.js' | head -1)
test -n "$BUNDLE" && echo "bundle=$BUNDLE" || { echo "FAIL no bundle"; exit 1; }
curl -fsS -o /dev/null -w "main_js %{http_code} %{size_download}\n" "$BASE$BUNDLE"
curl -fsS -o /dev/null -w "css %{http_code}\n" "$BASE$(echo "$HTML" | grep -oE '/assets/index-[^"]+\.css' | head -1)"
curl -fsS -o /dev/null -w "config %{http_code}\n" "$BASE/api/config"
curl -fsS -o /dev/null -w "health %{http_code}\n" "$BASE/health"

echo "=== Playwright desktop ==="
export NODE_PATH=/ms-playwright/playwright/node_modules
docker run --rm --network host -v /tmp/browser-console-test.js:/test.js:ro \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  node /test.js
echo "ALL OK"
