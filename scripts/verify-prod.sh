#!/bin/bash
set -euo pipefail
BASE="${1:-https://game.navalclash.ru}"
HTML=$(curl -sS "$BASE/")
if echo "$HTML" | grep -q crossorigin; then
  echo "FAIL: index.html still has crossorigin"
  exit 1
fi
BUNDLE=$(echo "$HTML" | grep -o 'index-[^"]*\.js' | head -1)
echo "OK: no crossorigin, bundle=$BUNDLE"
curl -sS -o /dev/null -w "config HTTP %{http_code}\n" "$BASE/api/config"
curl -sS -o /dev/null -w "js HTTP %{http_code} bytes %{size_download}\n" "$BASE/assets/$BUNDLE"
