# 🚢 Naval Clash — Telegram Mini App PvP Battleship

Production-ready PvP игра «Морской бой» с реальными ставками внутри Telegram Mini App.
Платформа берёт только комиссию (rake) — против игроков не играет.

## Стек

**Frontend**
- React 18 + Vite + TypeScript
- TailwindCSS + Framer Motion
- Zustand
- Telegram WebApp SDK
- Socket.IO client

**Backend**
- NestJS + TypeScript
- Socket.IO (server‑authoritative gameplay)
- PostgreSQL + Prisma ORM
- Redis (sessions, matchmaking queue, locks)
- JWT auth + Telegram initData валидация

**DevOps**
- Docker + docker‑compose
- Nginx (reverse‑proxy + статика + WS upgrade)
- PM2 (production process manager)

---

## Быстрый старт (локально через Docker)

```bash
cp .env.example .env
# впишите свои значения (минимум: BOT_TOKEN, JWT_SECRET)

docker compose up --build
```

После старта:
- API:        http://localhost:4000
- Frontend:   http://localhost:5173 (dev) / http://localhost (через nginx)
- Postgres:   localhost:5432
- Redis:      localhost:6379

## Разработка без Docker

### Backend
```bash
cd backend
npm install
npx prisma migrate dev
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Архитектура

### Server‑authoritative
Клиент **никогда** не знает расположение кораблей соперника, не валидирует
ходы и не считает победителя. Всё это делает сервер. Клиент посылает
только команды (`placement`, `attack`, `surrender`) и получает события.

### Поток матча
1. Auth (Telegram initData → JWT)
2. Игрок выбирает ставку (или создаёт приватное лобби)
3. Matchmaking сводит двух игроков с одинаковой ставкой
4. Атомарная блокировка средств у обоих
5. Фаза расстановки (30 сек), отправка финального борда
6. Фаза боя — попеременные ходы, попадание = ещё ход
7. Победа: payout = `wager × 2 × (1 - rake)`, проигравший — 0
8. Rematch

### Антифрод
- Все хранения борда — на сервере (зашифровано в JSON в `GameStates.player1Board`)
- Сокет‑guard проверяет JWT, ownership матча и ходом ли игрока
- Rate‑limit на эндпоинты и на сокет‑события
- Транзакции кошелька — через `prisma.$transaction`, row‑level lock через Redis (`SETNX`)
- Replay‑защита: каждое действие имеет `nonce` + проверяется на дубликаты в Redis

---

## Деплой (production)

См. `docs/DEPLOYMENT.md` (или раздел ниже в README).

Минимальный план:
1. VPS (Ubuntu 22.04) + домен с HTTPS (Telegram Mini App требует TLS)
2. `docker compose -f docker-compose.prod.yml up -d`
3. Зарегистрировать Mini App в @BotFather: `/newapp`, указать домен
4. Установить webhook бота на `https://yourdomain/api/telegram/webhook`

## Лицензия
MIT
