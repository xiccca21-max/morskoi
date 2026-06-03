#!/bin/bash
# Локально на VPS после git pull или rsync исходников
set -euo pipefail
cd "${APP_DIR:-/opt/naval-clash}"
export GIT_SHA="${GIT_SHA:-security-$(date +%Y%m%d)}"
docker compose -f docker-compose.prod.yml build --build-arg GIT_SHA="${GIT_SHA}" app
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml restart nginx
chmod +x scripts/prod-security-check.sh 2>/dev/null || true
./scripts/prod-security-check.sh
