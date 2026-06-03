# Аудит безопасности Naval Clash (прод)

Дата: 2026-06-03. Метод: код + OWASP-чеклист для Mini App + практики Battleship/TG gambling.

## Корабли соперника — утечки позиций

**Вердикт: защита на сервере сделана правильно.**

| Канал | Что уходит клиенту | Файл |
|-------|------------------|------|
| `GET /api/game/state/:id` | `enemy.view` = только выстрелы + потопленные корабли | `game.service.ts` → `publicEnemyView()` |
| Socket `match:state` | То же, **отдельно каждому** в `user:{id}` | `game.gateway.ts` → `broadcastStateToBothPlayers()` |
| Socket `match:attack` | Координата выстрела, hit/sunk, клетки **потопленного** корабля | по правилам игры |
| БД / админка | Полные борды только на сервере | `GameState.player1Board` JSON |

`PrivateBoard.ships` помечен «никогда не отправляется сопернику» (`engine/types.ts`). Чит через DevTools/network **не покажет** непотопленные корабли, если бэкенд не взломан.

**Что нельзя узнать до выстрела:** расположение живых кораблей.  
**Что можно узнать:** факт `opponentReady` (соперник расставился), профиль, историю выстрелов.

### Как тестируют (индустрия)

1. **Два клиента** — второй аккаунт не должен видеть чужие `ships` в JSON/WebSocket.
2. **Повтор запроса** — replay `game:attack` с nonce → отказ.
3. **Fuzz координат** — 0–9, повтор клетки → ошибка.
4. **Статический аудит** — grep `player1Board` в контроллерах.

Автотест: `backend/src/game/engine/board.spec.ts` (маска врага).

---

## Деньги — риски и фиксы

| Риск | Было | Статус |
|------|------|--------|
| Вывод бонусных/admin-кредитов | Проверялся `balance`, не `withdrawable` | **Исправлено** |
| PAID до Crypto Pay transfer | Статус PAID до перевода | **Исправлено** (transfer → PAID) |
| Двойной матч + двойной лок ставки | Лобби без проверки активного боя | **Исправлено** |
| Replay socket-команд | nonce опционален | **Исправлено** (обязателен в prod) |
| Webhook Crypto Pay | HMAC + idempotency | OK |
| Wallet locks | Redis `withLock` | OK (нужен `REDIS_URL` в prod) |

---

## Поддомены и прод

| Угроза | Митигация |
|--------|-----------|
| Cloudflare режет JS | `176-12-68-39.sslip.io` + URL бота; долгосрочно — **серое облако** на `game` |
| Редирект 302 теряет `#tgWebAppData` | HTML+JS редирект с `location.hash` |
| Чужой поддомен sslip.io | Не наш домен; не хранить секреты в URL sslip |
| `admin.html` в открытом доступе | В prod только с IP из `ADMIN_PANEL_IPS` |
| CORS | Только `CORS_ORIGINS` из `.env` |

**Прод-чеклист:** `scripts/prod-security-check.sh`

---

## Админка

- API: `x-admin-key` + `timingSafeEqual` — OK.
- **Не хранить** ключ в `localStorage` на общем ПК.
- Задать `ADMIN_PANEL_IPS=твой.IP` на VPS.

---

## Остаётся сделать вручную (без API Cloudflare)

1. DNS `game` → **серое облако** (прокси выкл) → `TELEGRAM_WEBAPP_URL=https://game.navalclash.ru`
2. Compression rule: только Brotli+Gzip (без Zstd) — [CF #701862](https://community.cloudflare.com/t/zstd-compression-is-randomly-truncating-responses/701862)
3. `CLOUDFLARE_API_TOKEN` в `.env` → `scripts/cf-apply-network-fix.sh`

---

## Нельзя «увеличить шансы» легально

- Подсмотр сети — маска сервера.
- Бот в PvP — отдельные матчи, `lockWagerForMatch`.
- Подмена хода — JWT + `currentTurn` + lock на матч.
- Два матча на ставки — блок активного боя в MM и лобби.

Уязвимость админ-ключа = полный доступ к балансам (операционный риск).
