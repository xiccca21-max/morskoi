#!/bin/bash
# Обновление на VPS после git push
set -euo pipefail

cd "${APP_DIR:-/opt/naval-clash}"
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d

# Ждём поднятия backend (до 90с)
for i in $(seq 1 18); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "OK: backend healthy"
    break
  fi
  echo "waiting for backend... ($i/18)"
  sleep 5
done

docker image prune -f
chmod +x scripts/smoke-test.sh 2>/dev/null || true
bash scripts/smoke-test.sh http://127.0.0.1:4000 || echo "WARN: smoke test failed — check docker logs app"
