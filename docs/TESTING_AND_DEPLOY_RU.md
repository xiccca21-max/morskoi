# Как тестировать игру с соперником и деплоить без туннелей

> **Кратко:** пошаговый деплой за 10 минут — [QUICK_DEPLOY_RU.md](./QUICK_DEPLOY_RU.md)

Локальные туннели (`localtunnel`, `localhost.run`) **не подходят** для Telegram Mini App:
они живут 20–30 минут, просят ввести IP, часто отдают 503. Для нормального теста нужен **постоянный HTTPS‑домен** на сервере и **автодеплой при push**.

---

## Что тебе нужно в итоге

| Что | Зачем |
|-----|-------|
| VPS или Railway/Render | Сервер, который работает 24/7 |
| Домен + HTTPS | Telegram требует HTTPS для Mini App |
| GitHub репозиторий | Push → автоматически обновляется на сервере |
| 2 Telegram‑аккаунта | Тест PvP «игрок vs игрок» |

---

## Вариант A — самый простой: Railway (авто при push)

1. Залей проект на GitHub (см. раздел «Git» ниже).
2. Зайди на [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Выбери репозиторий. Railway сам соберёт Docker‑образ из корневого `Dockerfile`.
4. В **Variables** добавь:
   ```
   NODE_ENV=production
   DATABASE_URL=file:/data/naval.db
   JWT_SECRET=случайная_строка_32_символа_минимум
   TELEGRAM_BOT_TOKEN=твой_токен
   TELEGRAM_BOT_USERNAME=MyNavalClashBot
   TELEGRAM_WEBAPP_URL=https://ТВОЙ-URL.up.railway.app
   CORS_ORIGINS=https://ТВОЙ-URL.up.railway.app
   TELEGRAM_BOT_POLLING=false
   ```
5. Settings → **Generate Domain** → получишь URL вида `https://naval-clash-production.up.railway.app`.
6. Обнови `TELEGRAM_WEBAPP_URL` и `CORS_ORIGINS` на этот URL.
7. В [@BotFather](https://t.me/BotFather):
   - `/mybots` → твой бот → **Bot Settings** → **Menu Button**
   - **Configure menu button** → URL = `https://ТВОЙ-URL.up.railway.app`, текст кнопки = `Play`
8. Каждый **push в main** → Railway пересобирает и перезапускает приложение.

> Railway даёт постоянный URL без туннелей. Для SQLite добавь Volume в Railway (Mount Path: `/data`).

---

## Вариант B — VPS + Docker + GitHub Actions

### 1. VPS

Подойдёт любой VPS (Timeweb, Selectel, Hetzner, DigitalOcean). Минимум: 1 CPU, 1 GB RAM, Ubuntu 22.04.

### 2. Один раз на сервере

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Клонировать проект
sudo mkdir -p /opt/naval-clash
sudo chown $USER:$USER /opt/naval-clash
git clone https://github.com/ТВОЙ_ЮЗЕР/naval-clash.git /opt/naval-clash
cd /opt/naval-clash

# env
cp .env.example .env
nano .env   # заполни токены (см. ниже)
```

**Обязательные переменные в `.env` на сервере:**

```env
NODE_ENV=production
JWT_SECRET=длинный_секрет_32_символа
TELEGRAM_BOT_TOKEN=8922759797:...
TELEGRAM_BOT_USERNAME=MyNavalClashBot
TELEGRAM_WEBAPP_URL=https://game.твой-домен.ru
CORS_ORIGINS=https://game.твой-домен.ru
TELEGRAM_BOT_POLLING=false
```

### 3. HTTPS (Let's Encrypt)

```bash
# A-запись домена → IP сервера
sudo apt install certbot
sudo certbot certonly --standalone -d game.твой-домен.ru

mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/game.твой-домен.ru/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/game.твой-домен.ru/privkey.pem nginx/certs/
sudo chown -R $USER:$USER nginx/certs
```

### 4. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl https://game.твой-домен.ru/health   # должно вернуть ok
```

### 5. Автодеплой при push

На GitHub → Settings → Secrets → Actions:

| Secret | Значение |
|--------|----------|
| `DEPLOY_HOST` | IP сервера |
| `DEPLOY_USER` | `root` или `ubuntu` |
| `DEPLOY_SSH_KEY` | приватный SSH‑ключ |
| `DEPLOY_PATH` | `/opt/naval-clash` |

Файл `.github/workflows/deploy.yml` уже в проекте. После push в `main` сервер сам делает `git pull` и `docker compose up --build`.

---

## BotFather — правильная настройка

Частая ошибка: URL вписывают в **название** кнопки вместо поля URL.

1. `/mybots` → @MyNavalClashBot
2. **Bot Settings** → **Menu Button** → **Configure menu button**
3. **Button text:** `Play` (короткое слово, не URL!)
4. **Web App URL:** `https://твой-постоянный-домен.ru` (без `/` в конце)

Опционально `/setdomain` → тот же домен.

---

## Как тестировать PvP с соперником

### Два аккаунта Telegram

- Телефон + второй аккаунт (другой телефон / Telegram Desktop / Web)
- Или попроси друга открыть бота

У каждого при первом входа **$100 демо‑баланс**.

### Способ 1 — Быстрый матч

1. Оба открывают бота → **Play**
2. Оба выбирают **одинаковую ставку** (например $10)
3. Нажимают **Quick Match**
4. Когда оба в очереди — матч создаётся автоматически
5. Расстановка кораблей → бой → результат

### Способ 2 — Приватное лобби (удобнее для теста)

1. Игрок 1: **Create Lobby** → ставка $5 → получает **код** (например `AB12CD`)
2. Игрок 2: **Join Lobby** → вводит код
3. Оба расставляют корабли и играют

### Что проверять

- [ ] Оба видят одну и ту же игру (ходы синхронны)
- [ ] Баланс списывается при старте, победитель получает выигрыш минус 5% rake
- [ ] История матчей в профиле
- [ ] Rematch после игры

### Если один игрок «завис»

Перезапусти Mini App (закрой и снова Play). WebSocket переподключится по JWT.

---

## Git — первый раз

```powershell
cd "c:\Users\fanis\OneDrive\Desktop\морской бой"
git init
git add .
git commit -m "Initial Naval Clash"
# Создай репо на github.com, затем:
git remote add origin https://github.com/ТВОЙ_ЮЗЕР/naval-clash.git
git branch -M main
git push -u origin main
```

**Не коммить** `backend/.env` с токеном — он в `.gitignore`.

---

## Локальная разработка vs прод

| | Локально | Прод (VPS/Railway) |
|--|----------|-------------------|
| URL | localhost / туннель | постоянный HTTPS |
| База | SQLite `backend/dev.db` | SQLite `/data/naval.db` на volume |
| Frontend | `npm run dev` или `dist` | baked в Docker |
| Обновление | вручную | push в GitHub |

Локально по‑прежнему можно:

```powershell
cd backend
npm run start:dev
# frontend/dist должен быть собран: cd ../frontend && npm run build
```

Но **тест в Telegram** делай только через прод‑URL, не через туннель.

---

## Чеклист «всё работает»

1. `https://твой-домен/health` → OK
2. В браузере открывается splash «NAVAL CLASH»
3. В Telegram кнопка Play открывает игру (не серый экран)
4. Два аккаунта могут сыграть матч через лобби
5. После `git push` через 2–5 минут на сервере новая версия

---

## Безопасность

Токен бота светился в чате — **смени его** в BotFather: `/revoke`, затем обнови `.env` на сервере и перезапусти контейнер.
