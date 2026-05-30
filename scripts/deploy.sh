#!/bin/bash
# Обновление на VPS после git push
set -euo pipefail

cd "${APP_DIR:-/opt/naval-clash}"
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml build --no-cache app
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
echo "OK: $(curl -s https://localhost/health 2>/dev/null || curl -s http://127.0.0.1:4000/health)"
