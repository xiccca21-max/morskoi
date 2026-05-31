#!/bin/bash
# Быстрая проверка после деплоя: bash scripts/smoke-test.sh [BASE_URL]
set -euo pipefail
BASE="${1:-http://127.0.0.1:4000}"

echo "→ GET $BASE/health"
health=$(curl -sf "$BASE/health")
echo "$health" | grep -q '"ok":true' || { echo "health failed: $health"; exit 1; }

echo "→ GET $BASE/api/config"
cfg=$(curl -sf "$BASE/api/config")
echo "$cfg" | grep -q 'minWager' || { echo "config failed: $cfg"; exit 1; }

echo "OK smoke test passed"
