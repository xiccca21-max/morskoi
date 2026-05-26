# Socket.IO протокол Naval Clash

Все клиентские эмиты ожидают **ack-функцию**: `{ ok: boolean, error?: string, ... }`.

## Handshake

```
io(SOCKET_URL, { auth: { token: '<JWT>' } })
```

Сервер при `connection`:
- проверяет JWT
- ищет активный матч пользователя — если есть, заводит в `match:<id>` комнату и шлёт `match:state`

## Клиент → Сервер

| Событие                | Payload                                                | Описание                                |
|------------------------|--------------------------------------------------------|-----------------------------------------|
| `mm:join`              | `{ wagerAmount, nonce? }`                              | Встать в очередь                       |
| `mm:leave`             | `{}`                                                   | Выйти из очереди                       |
| `lobby:join`           | `{ code, nonce? }`                                     | Присоединиться к приватному лобби      |
| `match:requestState`   | `{ matchId }`                                          | Запросить актуальный state             |
| `game:placement`       | `{ matchId, ships \| 'auto', nonce? }`                 | Финальная расстановка                  |
| `game:attack`          | `{ matchId, x, y, nonce? }`                            | Атака по клетке                        |
| `game:surrender`       | `{ matchId, nonce? }`                                  | Сдаться                                |
| `match:rematch`        | `{ matchId, nonce? }`                                  | Согласие на реванш                     |
| `ping`                 | —                                                      | Heartbeat                              |

`nonce` — рекомендуемая защита от replay. Сервер хранит nonce 60 сек.

## Сервер → Клиент

| Событие                   | Payload                                                                 |
|---------------------------|--------------------------------------------------------------------------|
| `auth:error`              | `{ message }` — отключение                                              |
| `match:found`             | `{ matchId, wagerAmount, opponentId }`                                  |
| `match:state`             | См. `MatchState` (приватный для каждого игрока, с маской вражеского борда) |
| `match:start`             | `{ matchId, firstTurn, deadline }`                                      |
| `match:attack`            | `{ by, x, y, hit, sunk, sunkShip?, nextTurn, gameStatus, winnerId }`    |
| `match:turnTimeout`       | `{ nextTurn, timedOut }`                                                |
| `match:finished`          | `{ matchId, winnerId, prizePool?, rakeAmount?, surrenderedBy? }`        |
| `match:rematchRequested`  | `{ by, ready: string[] }`                                               |
| `match:rematchStarted`    | `{ oldMatchId, newMatchId }`                                            |
| `wallet:update`           | `number` — новый баланс                                                 |

## Структура `MatchState`

```ts
{
  matchId: string;
  status: 'PENDING'|'PLACEMENT'|'IN_PROGRESS'|'FINISHED'|'CANCELLED';
  gameStatus: 'PLACEMENT'|'IN_PROGRESS'|'FINISHED';
  wagerAmount: number;
  prizePool: number;
  rakeAmount: number;
  winnerId: string | null;
  currentTurn: string | null;       // userId или null
  turnDeadline: ISO date string;
  me: {
    userId: string;
    own: { ships: ShipPlacement[]; attacks: AttackCell[] };  // полный свой борд
  };
  enemy: {
    userId: string;
    view: {
      attacks: AttackCell[];        // только результаты моих ударов
      sunkShips: { id, kind, cells }[];
    };
  };
  opponentReady: boolean;
}
```

В `enemy.view` **никогда** не приходит расстановка вражеских кораблей —
только клетки, в которые я уже стрелял + полностью потопленные корабли.
