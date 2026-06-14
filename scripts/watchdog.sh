#!/bin/bash
# watchdog.sh — запускать как cron каждые 30 минут.
# Если версия в работающем контейнере != origin/main — автоматически передеплоить.
#
# Добавить в crontab:
#   crontab -e
#   */30 * * * * /opt/naval-clash/scripts/watchdog.sh >> /var/log/naval-watchdog.log 2>&1
#
set -uo pipefail

DIR="${APP_DIR:-/opt/naval-clash}"
COMPOSE="docker compose -f docker-compose.prod.yml"
CONTAINER="naval-clash-app-1"
LOG_PREFIX="[watchdog $(date '+%Y-%m-%d %H:%M:%S')]"

cd "$DIR"

# Текущий коммит в origin/main
git fetch origin main -q 2>/dev/null || true
TARGET=$(git rev-parse --short origin/main 2>/dev/null || echo "")
if [ -z "$TARGET" ]; then
  echo "$LOG_PREFIX ERROR: не удалось получить origin/main SHA" >&2
  exit 1
fi

# Версия, реально крутящаяся в контейнере
RUNNING=$(docker inspect "$CONTAINER" --format '{{ range .Config.Env }}{{ println . }}{{ end }}' 2>/dev/null \
  | grep '^APP_RELEASE=' | cut -d= -f2 || echo "")

echo "$LOG_PREFIX running=$RUNNING target=$TARGET"

if [ "$RUNNING" = "$TARGET" ]; then
  echo "$LOG_PREFIX OK — версии совпадают, всё в порядке."
  exit 0
fi

echo "$LOG_PREFIX ВНИМАНИЕ: рассинхронизация! Запускаю передеплой..."

# Обновляем код до origin/main и передеплоиваем
git reset --hard origin/main
export GIT_SHA="$TARGET"
bash "$DIR/scripts/deploy.sh"

echo "$LOG_PREFIX Передеплой завершён: $RUNNING → $TARGET"
