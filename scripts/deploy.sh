#!/bin/bash
# Обновление на VPS после git push
set -euo pipefail

cd "${APP_DIR:-/opt/naval-clash}"
git fetch origin main
git reset --hard origin/main
GIT_SHA="$(git rev-parse --short HEAD)"
echo "Deploying commit ${GIT_SHA}"
export GIT_SHA
docker compose -f docker-compose.prod.yml build --build-arg GIT_SHA="${GIT_SHA}" app
docker compose -f docker-compose.prod.yml up -d

# Ждём backend внутри контейнера (порт 4000 не проброшен на хост)
health_ok() {
  docker compose -f docker-compose.prod.yml exec -T app \
    node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

for i in $(seq 1 18); do
  if health_ok 2>/dev/null; then
    echo "OK: backend healthy (commit ${GIT_SHA})"
    break
  fi
  echo "waiting for backend... ($i/18)"
  sleep 5
  if [ "$i" -eq 18 ]; then
    echo "ERROR: backend did not become healthy — last logs:"
    docker compose -f docker-compose.prod.yml logs --tail=80 app || true
    exit 1
  fi
done

# nginx кэширует IP upstream — перезапуск после redeploy app
docker compose -f docker-compose.prod.yml restart nginx

docker image prune -f
chmod +x scripts/smoke-test.sh 2>/dev/null || true
docker compose -f docker-compose.prod.yml exec -T app \
  node -e "Promise.all([fetch('http://127.0.0.1:4000/health'),fetch('http://127.0.0.1:4000/api/config')]).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))" \
  || echo "WARN: smoke check failed — see docker logs app"
