# Пошаговый деплой Naval Clash на Timeweb (постоянный HTTPS)

Репозиторий: https://github.com/xiccca21-max/morskoi

---

## Этап 0 — что должно быть готов

- [ ] Аккаунт Timeweb Cloud
- [ ] Бот в [@BotFather](https://t.me/BotFather) + **токен**
- [ ] Репозиторий на GitHub (уже есть)
- [ ] ~1100 ₽/мес на VPS + домен

---

## Этап 1 — создать VPS на Timeweb

1. https://timeweb.cloud/services/vds-vps
2. Регион: **Москва**
3. Тариф: **Cloud MSK 50** (4 GB RAM)
4. ОС: **Ubuntu 22.04**
5. **Публичный IPv4** — включён
6. «Создать» → дождаться статуса «Работает»
7. Запиши:
   - **IP сервера** (например `185.xxx.xxx.xxx`)
   - **Пароль root** (или SSH-ключ)

---

## Этап 2 — купить домен

Можно на Timeweb или reg.ru. Пример: `navalclash.ru`

1. Купи домен
2. DNS → **A-запись**:
   - Имя: `@` (или `game` для `game.navalclash.ru`)
   - Значение: **IP твоего VPS**
   - TTL: 300–3600
3. Подожди 5–30 минут, пока DNS обновится

Проверка с ПК:
```powershell
nslookup navalclash.ru
```
Должен показать IP сервера.

Дальше в инструкции домен = `navalclash.ru` — подставь свой.

---

## Этап 3 — подключиться к серверу

**Windows (PowerShell):**
```powershell
ssh root@185.xxx.xxx.xxx
```
Введи пароль root. Ты в консоли сервера (Linux).

---

## Этап 4 — установить Docker

На сервере выполни по очереди:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y git certbot
mkdir -p /opt/naval-clash/nginx/certs
```

---

## Этап 5 — скачать проект

```bash
cd /opt/naval-clash
git clone https://github.com/xiccca21-max/morskoi.git .
```

---

## Этап 6 — создать `.env`

```bash
cp .env.example .env
nano .env
```

Замени содержимое на (подставь свои значения):

```env
NODE_ENV=production

JWT_SECRET=придумай_длинную_случайную_строку_32_символа_минимум
JWT_EXPIRES_IN=7d

TELEGRAM_BOT_TOKEN=твой_токен_от_BotFather
TELEGRAM_BOT_USERNAME=MyNavalClashBot
TELEGRAM_WEBAPP_URL=https://navalclash.ru
TELEGRAM_BOT_POLLING=false

CORS_ORIGINS=https://navalclash.ru

PLATFORM_RAKE_PERCENT=5
MIN_WAGER=1
MAX_WAGER=1000
```

Сохранить в nano: `Ctrl+O` → Enter → `Ctrl+X`.

**JWT_SECRET** — любая случайная строка, например:
```bash
openssl rand -hex 32
```

---

## Этап 7 — получить SSL-сертификат (HTTPS)

Порты 80/443 должны быть свободны (Docker ещё не запускали).

```bash
certbot certonly --standalone -d navalclash.ru --agree-tos -m твой@email.com --non-interactive
```

Скопируй сертификаты:

```bash
cp /etc/letsencrypt/live/navalclash.ru/fullchain.pem /opt/naval-clash/nginx/certs/
cp /etc/letsencrypt/live/navalclash.ru/privkey.pem /opt/naval-clash/nginx/certs/
```

Если используешь поддомен `game.navalclash.ru` — в certbot укажи `-d game.navalclash.ru`.

---

## Этап 8 — запустить игру

```bash
cd /opt/naval-clash
docker compose -f docker-compose.prod.yml up -d --build
```

Первый билд **5–15 минут**. Смотри логи:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Когда увидишь `Naval Clash backend running on :4000` — готово. `Ctrl+C` выходит из логов.

Проверка:

```bash
curl https://navalclash.ru/health
```

Ответ: `{"ok":true,"ts":...}`

В браузере открой `https://navalclash.ru` — splash «NAVAL CLASH».

---

## Этап 9 — настроить Telegram-бота

1. Открой [@BotFather](https://t.me/BotFather)
2. `/mybots` → твой бот
3. **Bot Settings** → **Menu Button** → **Configure menu button**
4. **Button text:** `Play`
5. **Web App URL:** `https://navalclash.ru`
6. Опционально: `/setdomain` → `navalclash.ru`

---

## Этап 10 — протестировать

1. Открой бота в Telegram (с VPN, если у тебя так работает Telegram)
2. Нажми **Play** (или кнопку меню)
3. Должен открыться экран игры, не серый экран
4. Для PvP — второй аккаунт → **Create Lobby** / **Join Lobby**

---

## Этап 11 — автодеплой при push (опционально)

Чтобы после `git push` сервер сам обновлялся:

### На сервере — SSH-ключ для GitHub Actions

```bash
ssh-keygen -t ed25519 -f /root/.ssh/deploy_key -N ""
cat /root/.ssh/deploy_key.pub >> /root/.ssh/authorized_keys
cat /root/.ssh/deploy_key
```

Скопируй **приватный** ключ (весь вывод).

### На GitHub

https://github.com/xiccca21-max/morskoi/settings/secrets/actions

| Secret | Значение |
|--------|----------|
| `DEPLOY_HOST` | IP сервера |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | приватный ключ |
| `DEPLOY_PATH` | `/opt/naval-clash` |

После push в `main` GitHub Actions сам сделает `git pull` и пересборку.

---

## Обновление вручную

```bash
cd /opt/naval-clash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Продление SSL (раз в ~3 месяца)

```bash
certbot renew
cp /etc/letsencrypt/live/navalclash.ru/fullchain.pem /opt/naval-clash/nginx/certs/
cp /etc/letsencrypt/live/navalclash.ru/privkey.pem /opt/naval-clash/nginx/certs/
docker compose -f docker-compose.prod.yml restart nginx
```

---

## Если что-то не работает

| Симптом | Решение |
|---------|---------|
| Серый экран в Telegram | Проверь URL в BotFather, должен быть `https://` |
| `502 Bad Gateway` | `docker compose logs app` — смотри ошибки |
| `health` не отвечает | `docker ps` — контейнер `app` должен быть Up |
| Нет SSL | Сертификаты в `nginx/certs/` |
| DNS не резолвится | Подожди, проверь A-запись |

Перезапуск всего:

```bash
cd /opt/naval-clash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Итоговая схема

```
Telegram (игрок) → https://navalclash.ru
                        ↓
                   nginx (443, SSL)
                        ↓
                   app (игра + API + WebSocket)
                        ↓
                   SQLite (/data/naval.db)
```

Сервер работает 24/7. Твой домашний интернет нужен только когда пушишь код.
