#!/bin/bash
# Диагностика «мини-апп не грузится» на VPS
# Использование: bash scripts/diagnose-miniapp.sh [https://game.твой-домен.ru]
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/naval-clash}"
cd "$APP_DIR" 2>/dev/null || cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$(grep -E '^TELEGRAM_WEBAPP_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
DOMAIN="${DOMAIN%/}"

echo "=== Naval Clash — диагностика Mini App ==="
echo "Домен: ${DOMAIN:-не задан}"
echo ""

fail=0
warn=0

check() {
  local label="$1"
  local ok="$2"
  if [[ "$ok" == "ok" ]]; then
    echo "  [OK]   $label"
  elif [[ "$ok" == "warn" ]]; then
    echo "  [!!]   $label"
    warn=$((warn + 1))
  else
    echo "  [FAIL] $label"
    fail=$((fail + 1))
  fi
}

echo "1. Docker-контейнеры"
if docker compose -f docker-compose.prod.yml ps --format '{{.Name}} {{.Status}}' 2>/dev/null | grep -q .; then
  docker compose -f docker-compose.prod.yml ps
  docker compose -f docker-compose.prod.yml ps --format '{{.Name}} {{.Status}}' | grep -q 'app.*Up' && check "app running" ok || check "app running" fail
  docker compose -f docker-compose.prod.yml ps --format '{{.Name}} {{.Status}}' | grep -q 'nginx.*Up' && check "nginx running" ok || check "nginx running" fail
else
  check "docker compose prod" fail
fi
echo ""

echo "2. SSL-сертификаты nginx"
if [[ -f nginx/certs/fullchain.pem && -f nginx/certs/privkey.pem ]]; then
  check "certs exist" ok
  exp=$(openssl x509 -enddate -noout -in nginx/certs/fullchain.pem 2>/dev/null | cut -d= -f2 || echo "?")
  echo "       expires: $exp"
else
  check "certs in nginx/certs/" fail
fi
echo ""

echo "3. .env — критичные переменные"
if [[ ! -f .env ]]; then
  check ".env exists" fail
else
  check ".env exists" ok
  grep -qE '^JWT_SECRET=.{16,}' .env && ! grep -q 'замени_openssl' .env && check "JWT_SECRET set" ok || check "JWT_SECRET set (real random)" warn
  grep -qE '^TELEGRAM_BOT_TOKEN=[0-9]+:' .env && check "TELEGRAM_BOT_TOKEN format" ok || check "TELEGRAM_BOT_TOKEN format" fail
  grep -qE '^TELEGRAM_WEBAPP_URL=https://' .env && check "TELEGRAM_WEBAPP_URL https" ok || check "TELEGRAM_WEBAPP_URL https" fail
  grep -qE '^CORS_ORIGINS=https://' .env && check "CORS_ORIGINS https" ok || check "CORS_ORIGINS https" warn
  if grep -q '^TELEGRAM_BOT_POLLING=false' .env; then
    grep -qE '^TELEGRAM_WEBHOOK_URL=https://' .env && check "TELEGRAM_WEBHOOK_URL (required when polling=false)" ok || check "TELEGRAM_WEBHOOK_URL (required when polling=false)" fail
  fi
  if grep -qE 'твой-домен|BotFather|замени_' .env; then
    check "no placeholder values left in .env" warn
  fi
fi
echo ""

echo "4. Backend health (inside app container)"
if docker compose -f docker-compose.prod.yml exec -T app node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(j.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})" 2>/dev/null; then
  check "GET /health" ok
else
  check "GET /health" fail
  echo "       --- last app logs ---"
  docker compose -f docker-compose.prod.yml logs --tail=30 app 2>/dev/null || true
fi
echo ""

echo "5. HTTPS снаружи"
if [[ -n "$DOMAIN" ]]; then
  code=$(curl -sS -o /tmp/naval-health.json -w '%{http_code}' --connect-timeout 10 "$DOMAIN/health" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    check "curl $DOMAIN/health → 200" ok
    cat /tmp/naval-health.json 2>/dev/null || true
    echo ""
  else
    check "curl $DOMAIN/health → 200 (got $code)" fail
  fi

  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 "$DOMAIN/" 2>/dev/null || echo "000")
  [[ "$code" == "200" ]] && check "curl $DOMAIN/ → 200 (SPA)" ok || check "curl $DOMAIN/ → 200 (got $code)" fail

  xfo=$(curl -sSI --connect-timeout 10 "$DOMAIN/" 2>/dev/null | grep -i 'x-frame-options' || true)
  if [[ -n "$xfo" && "$xfo" != *"ALLOWALL"* ]]; then
    check "no blocking X-Frame-Options ($xfo)" warn
  else
    check "X-Frame-Options ok for Telegram" ok
  fi
else
  check "external HTTPS check (pass domain as arg)" warn
fi
echo ""

echo "6. BotFather checklist (вручную)"
echo "  - /mybots → Bot Settings → Menu Button → URL = TELEGRAM_WEBAPP_URL (без / в конце)"
echo "  - /setdomain → тот же домен"
echo "  - URL в BotFather = URL в .env TELEGRAM_WEBAPP_URL и CORS_ORIGINS"
echo ""

echo "=== Итого: $fail ошибок, $warn предупреждений ==="
if [[ "$fail" -gt 0 ]]; then
  echo ""
  echo "Частые фиксы:"
  echo "  nano .env   # TELEGRAM_WEBHOOK_URL, JWT_SECRET, BOT_TOKEN"
  echo "  docker compose -f docker-compose.prod.yml up -d --build"
  exit 1
fi
exit 0
