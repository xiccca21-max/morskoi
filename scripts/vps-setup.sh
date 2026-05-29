#!/bin/bash
# Первичная настройка VPS (Ubuntu 22.04, Москва)
# Запуск на сервере:
#   curl -fsSL https://raw.githubusercontent.com/xiccca21-max/morskoi/main/scripts/vps-setup.sh -o vps-setup.sh
#   chmod +x vps-setup.sh
#   sudo ./vps-setup.sh game.твой-домен.ru твой@email.com
#
# Или после git clone:
#   sudo ./scripts/vps-setup.sh game.твой-домен.ru твой@email.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/opt/naval-clash}"
REPO="${REPO:-https://github.com/xiccca21-max/morskoi.git}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Использование: sudo $0 <домен> <email для Let's Encrypt>"
  echo "Пример:       sudo $0 game.navalclash.ru admin@navalclash.ru"
  exit 1
fi

echo "==> Обновление системы..."
apt update && apt upgrade -y

echo "==> Docker, git, certbot, ufw..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
apt install -y git certbot ufw

echo "==> Firewall (22, 80, 443)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Каталог приложения: $APP_DIR"
mkdir -p "$APP_DIR/nginx/certs"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO" "$APP_DIR"
else
  echo "Репозиторий уже есть, пропускаем clone"
fi
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.production.example .env
  sed -i "s|game.твой-домен.ru|${DOMAIN}|g" .env
  sed -i "s|https://game.твой-домен.ru|https://${DOMAIN}|g" .env
  echo ""
  echo "!!! Отредактируй .env: nano $APP_DIR/.env"
  echo "    Обязательно: JWT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME"
  echo ""
  read -r -p "Нажми Enter после сохранения .env..."
fi

echo "==> SSL (Let's Encrypt)..."
systemctl stop nginx 2>/dev/null || true
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

certbot certonly --standalone \
  -d "$DOMAIN" \
  --agree-tos \
  -m "$EMAIL" \
  --non-interactive

cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" nginx/certs/
cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" nginx/certs/
chmod 644 nginx/certs/fullchain.pem
chmod 600 nginx/certs/privkey.pem

echo "==> Cron для продления SSL..."
CRON_CMD="0 4 * * 1 certbot renew --quiet && cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ${APP_DIR}/nginx/certs/ && cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ${APP_DIR}/nginx/certs/ && cd ${APP_DIR} && docker compose -f docker-compose.prod.yml restart nginx"
(crontab -l 2>/dev/null | grep -v "certbot renew" || true; echo "$CRON_CMD") | crontab -

echo "==> Сборка и запуск (5–15 мин)..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "Готово. Проверка:"
echo "  curl -s https://${DOMAIN}/health"
echo ""
echo "BotFather → Menu Button → https://${DOMAIN}"
echo "Обновления: cd ${APP_DIR} && ./scripts/deploy.sh"
