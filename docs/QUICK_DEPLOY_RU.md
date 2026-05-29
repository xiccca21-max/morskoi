# Быстрый деплой для тестов (24/7, без туннелей)

Telegram Mini App **требует HTTPS**. Для тестов проще всего **Railway** (5–10 минут). VPS с доменом — если уже есть сервер.

---

## Вариант 1 — Railway (рекомендуется для тестов)

1. Залей код на GitHub: `https://github.com/xiccca21-max/morskoi`
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → репозиторий `morskoi`
3. **Settings** → **Networking** → **Generate Domain** → скопируй URL, например `https://morskoi-production.up.railway.app`
4. **Variables** (обязательно):

   ```env
   NODE_ENV=production
   DATABASE_URL=file:/data/naval.db
   JWT_SECRET=случайная_строка_минимум_32_символа
   TELEGRAM_BOT_TOKEN=твой_токен_из_BotFather
   TELEGRAM_BOT_USERNAME=MyNavalClashBot
   TELEGRAM_WEBAPP_URL=https://ТВОЙ-URL.up.railway.app
   CORS_ORIGINS=https://ТВОЙ-URL.up.railway.app
   TELEGRAM_BOT_POLLING=false
   ```

5. **Volumes** → Add Volume → Mount Path: **`/data`** (иначе SQLite сбросится при рестарте)
6. **Redeploy** после сохранения переменных
7. Проверка: открой `https://ТВОЙ-URL.up.railway.app/health` → `ok`
8. **BotFather**: `/mybots` → бот → **Menu Button** → URL = тот же HTTPS (без `/` в конце), текст кнопки = `Play`

Каждый **push в `main`** → Railway пересобирает приложение.

---

## Вариант 2 — VPS без домена (Cloudflare Tunnel + HTTPS)

Подходит, если есть VPS (Timeweb, Hetzner и т.д.), но **нет домена**.

На сервере (Ubuntu):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогинься

git clone https://github.com/xiccca21-max/morskoi.git /opt/naval-clash
cd /opt/naval-clash
cp .env.example .env
nano .env   # токен бота, JWT_SECRET; TELEGRAM_WEBAPP_URL пока оставь пустым

docker compose -f docker-compose.test.yml up -d --build
curl http://127.0.0.1:4000/health
```

Туннель (даёт бесплатный `https://....trycloudflare.com`):

```bash
# cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/cloudflared

cloudflared tunnel --url http://127.0.0.1:4000
```

Скопируй HTTPS из вывода → впиши в `.env` как `TELEGRAM_WEBAPP_URL` и `CORS_ORIGINS` → перезапуск:

```bash
docker compose -f docker-compose.test.yml up -d
```

Для **постоянного** URL без перезапуска туннеля лучше зарегистрировать named tunnel в Cloudflare (см. документацию Cloudflare) или купить домен и перейти на вариант 3.

---

## Вариант 3 — VPS + домен + SSL (прод)

```bash
cd /opt/naval-clash
cp .env.example .env
# TELEGRAM_WEBAPP_URL=https://game.твой-домен.ru
# CORS_ORIGINS=https://game.твой-домен.ru

sudo certbot certonly --standalone -d game.твой-домен.ru
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/game.твой-домен.ru/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/game.твой-домен.ru/privkey.pem nginx/certs/
sudo chown -R $USER:$USER nginx/certs

docker compose -f docker-compose.prod.yml up -d --build
```

Подробнее: [PRODUCTION_SETUP_RU.md](./PRODUCTION_SETUP_RU.md)

---

## Автодеплой при push (VPS)

GitHub → **Settings** → **Secrets** → **Actions**:

| Secret | Пример |
|--------|--------|
| `DEPLOY_HOST` | IP VPS |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | приватный SSH-ключ |
| `DEPLOY_PATH` | `/opt/naval-clash` |

После push в `main` workflow `.github/workflows/deploy.yml` сам делает `git pull` и `docker compose -f docker-compose.prod.yml up -d --build`.

Для тестового compose без nginx измени в workflow последнюю строку на `docker-compose.test.yml`.

---

## Чеклист

- [ ] `/health` → ok
- [ ] В браузере открывается игра по HTTPS
- [ ] BotFather → Menu Button → тот же HTTPS URL
- [ ] Два Telegram-аккаунта: Quick Match или лобби по коду

---

## Локально vs сервер

| | Локально | Сервер |
|--|----------|--------|
| Telegram | туннели ненадёжны | постоянный HTTPS |
| База | `backend/dev.db` | volume `/data/naval.db` |
| Обновление | вручную | push → Railway / Actions |
