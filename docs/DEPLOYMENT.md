# Деплой Naval Clash

## 1. Подготовка

* VPS Ubuntu 22.04, минимум 2 CPU / 2 GB RAM.
* Домен с настроенными A‑записями.
* Установленные `docker`, `docker compose`, `nginx`, `certbot`.

## 2. Bot + Mini App

1. Создать бота в [@BotFather](https://t.me/BotFather): `/newbot` → токен.
2. Подключить Mini App: `/newapp`, указать домен (HTTPS обязателен).
3. (Опц.) `/setdomain` → ваш домен — нужно для inline Web App.

## 3. Клонирование и env

```bash
git clone <your repo> /opt/naval-clash
cd /opt/naval-clash
cp .env.example .env
# обязательно заполните: TELEGRAM_BOT_TOKEN, JWT_SECRET (32+ символов),
# TELEGRAM_WEBAPP_URL=https://your.domain
# VITE_API_URL=https://your.domain
# VITE_SOCKET_URL=https://your.domain
```

## 4. TLS

```bash
sudo certbot certonly --standalone -d your.domain
cp /etc/letsencrypt/live/your.domain/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/your.domain/privkey.pem  nginx/certs/
```

Раскомментировать HTTPS server-блок в `nginx/nginx.conf`, заменить `server_name`.

## 5. Старт

```bash
docker compose up -d --build
docker compose logs -f backend
```

Проверка:
```bash
curl https://your.domain/health           # health backend через nginx
curl https://your.domain/api/leaderboard  # требует Bearer, отдаст 401 — ок
```

## 6. Webhook бота (рекомендуется в проде)

В `.env`:
```
TELEGRAM_WEBHOOK_URL=https://your.domain/api/telegram/webhook
```

Тогда `TelegramBotService` будет работать через webhook вместо polling.

## 7. PM2 (альтернатива докеру для backend)

```bash
cd backend
npm install
npm run build
npx prisma migrate deploy
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 8. Бэкапы

```bash
# Простой ежедневный pg_dump
docker exec naval-clash-postgres-1 pg_dump -U naval naval_clash | \
  gzip > /backups/naval-$(date +%F).sql.gz
```

## 9. Масштабирование

* PostgreSQL — выделенный инстанс / managed (RDS, Supabase).
* Redis — managed (Upstash, ElastiCache). Используется для locks/nonces.
* Backend в нескольких репликах: см. примечание в `ARCHITECTURE.md` про
  турный таймер — нужно перенести из `setTimeout` в Redis‑воркер.
* Socket.IO с несколькими нодами — через `@socket.io/redis-adapter`.

## 10. Мониторинг

* `GET /health` для liveness/readiness.
* Логи Nest через stdout → docker → loki/grafana.
* Sentry SDK (легко добавить в `main.ts`).
