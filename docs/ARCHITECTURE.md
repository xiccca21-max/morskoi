# Архитектура Naval Clash

## Высокоуровневая схема

```
┌────────────────────────────────────────────────────────────────────┐
│                        Telegram WebApp                              │
│                            │                                        │
│                            ▼                                        │
│         ┌───────────────────────────────────────────┐               │
│         │  Frontend (React + Vite + Tailwind)        │               │
│         │  Telegram SDK  · Socket.IO client · Axios  │               │
│         └───────────┬────────────────────┬───────────┘               │
│                     │ HTTPS              │ WSS                       │
│                     ▼                    ▼                           │
│              ┌───────────────┐    ┌───────────────┐                  │
│              │   REST API    │    │  Socket.IO    │                  │
│              │ (auth, wallet,│    │   gateway     │                  │
│              │  mm, history) │    │ (gameplay)    │                  │
│              └───────┬───────┘    └───────┬───────┘                  │
│                      └────────┬───────────┘                          │
│                               ▼                                      │
│           ┌────────────────────────────────────────┐                 │
│           │           NestJS Backend                │                 │
│           │ Auth · Wallet · Game · Matchmaking · Bot│                 │
│           └────────┬──────────────────┬─────────────┘                 │
│                    ▼                  ▼                              │
│             ┌────────────┐     ┌────────────┐                        │
│             │ PostgreSQL │     │   Redis    │                        │
│             │  + Prisma  │     │ locks/queue│                        │
│             └────────────┘     └────────────┘                        │
└────────────────────────────────────────────────────────────────────┘
```

## Принципы

### Server-authoritative
* Клиент **никогда** не получает координаты вражеских кораблей.
* Клиент шлёт только команды (`game:placement`, `game:attack`, `game:surrender`).
* Сервер хранит борда в `GameStates.player1Board / player2Board` (JSON).
* Любая попытка отправить недостаток координат, не свой ход, чужой матч или
  повторный удар — отклоняется в `GameService`.

### Антифрод и защита
| Угроза                          | Контрмера                                                |
|--------------------------------|-----------------------------------------------------------|
| Подмена WebSocket‑пакетов       | JWT в `handshake.auth`, проверка ownership матча         |
| Replay сообщений               | Single-use `nonce` в Redis (см. `RedisService.consumeNonce`) |
| Race condition на кошельке     | `Redis SETNX` lock + `prisma.$transaction`               |
| Race condition в матче         | Lock `match:<id>` на каждое мутирующее действие          |
| Leak вражеского борда          | В payload идёт только `publicEnemyView`                  |
| Spam запросов                  | `@nestjs/throttler` глобально + ack/nonce на сокете      |
| Несанкционированный доступ      | `JwtAuthGuard` на каждом контроллере, кроме `auth`        |

### Поток матча (детально)

1. **Auth**  `POST /api/auth/telegram { initData }` → JWT + user.
2. **Старт поиска**
   * Быстрая: `POST /api/matchmaking/queue { wagerAmount }` или WS `mm:join`.
   * Приватная: `POST /api/matchmaking/lobby` → код `ABCDEF`, делишь ссылку.
3. **Сведение пары** → `GameService.createMatch()`:
   * `Match` со статусом `PLACEMENT`, `GameState` с пустыми бордами.
   * WS: `match:found` обоим игрокам, `match:state` со start placement.
4. **Расстановка** → WS `game:placement { matchId, ships | 'auto' }`:
   * `validateBoard()` — границы, флот, отсутствие наложений и касаний.
   * Когда оба готовы → `lockWagerForMatch` атомарно списывает у обоих.
   * Если у одного не хватило денег → `cancelMatch`, возврат другому.
5. **Бой** → WS `game:attack { matchId, x, y }`:
   * Проверка: текущий ход, валидность координат, клетка не атакована.
   * Сервер обновляет `defenderBoard.attacksReceived`, считает sunk/gameOver.
   * Hit → ход остаётся. Miss → передача хода и обновление `turnDeadline`.
   * Тайм-аут хода (20 сек) → автопередача хода через `handleTurnTimeout`.
6. **Окончание** → `settleMatch`:
   * `winnerId` → `balance += pool*(1-rake)`, `wins+=1`.
   * Loser → `losses += 1`, без возврата ставки.
   * Создаются Transaction(PAYOUT) + Transaction(RAKE).
   * WS `match:finished` с призовыми.
7. **Рематч** → `match:rematch`. Когда оба согласны — создаётся новый match,
   игроки автоматически переводятся на placement.

### Дисконнект и реконнект
* Socket.IO heartbeat (`pingInterval=25s`, `pingTimeout=20s`).
* При reconnect клиент шлёт тот же JWT в `handshake.auth.token`.
* `handleConnection` ищет активный матч и подписывает игрока обратно в комнату.
* Турный таймер живёт в `setTimeout` в gateway-инстансе. В мульти-инстансной
  установке его стоит вынести в Redis ZSET с воркером (TODO).

### Экономика
* `PLATFORM_RAKE_PERCENT=5` (env).
* Лимиты ставки: `MIN_WAGER`, `MAX_WAGER`.
* Все денежные операции — `Decimal(18,2)`, в коде — `+(x).toFixed(2)`.
* Любое изменение баланса = `WAGER_LOCK | WAGER_REFUND | PAYOUT | RAKE | DEPOSIT | WITHDRAW`.

## Папки

```
backend/src
├── auth/            Telegram initData валидация, JWT
├── common/          Общие фильтры/декораторы/health
├── game/
│   ├── engine/      Чистая игровая логика (валидация, удар, autoplace)
│   ├── game.service.ts   Server-authoritative actions
│   └── game.gateway.ts   Socket.IO endpoint
├── history/
├── leaderboard/
├── matchmaking/     Очередь + приватные лобби
├── prisma/
├── redis/           Lock helper, nonce
├── telegram-bot/    Notifications + /start
├── users/           Профиль /me
└── wallet/          Атомарные операции с балансом
```
