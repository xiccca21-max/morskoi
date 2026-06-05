#!/bin/sh
# Прод-деплой: pull → пересборка БЕЗ кэша → проверка версии.
# Запуск на VPS: sh scripts/deploy-prod.sh
set -eu

cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

GIT_SHA="$(git rev-parse --short HEAD)"
echo "==> commit $GIT_SHA"

export GIT_SHA
echo "==> docker build (no cache)"
docker compose -f docker-compose.prod.yml build --no-cache app

echo "==> docker up"
docker compose -f docker-compose.prod.yml up -d --force-recreate app
docker compose -f docker-compose.prod.yml restart nginx

echo "==> health"
sleep 5
curl -fsS "http://127.0.0.1:4000/health" 2>/dev/null || \
  docker compose -f docker-compose.prod.yml exec -T app wget -qO- http://127.0.0.1:4000/health || true

echo ""
echo "Готово. В браузере: curl -s https://navalclash.xyz/api/config | grep build"
echo "Должно быть: \"build\":\"$GIT_SHA\""
