import {
  AttackCell,
  AttackResult,
  BOARD_SIZE,
  PrivateBoard,
  ShipPlacement,
  SHIP_FLEET,
} from './types';

/** Возвращает все клетки, занимаемые кораблём. */
export function shipCells(s: ShipPlacement): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < s.size; i++) {
    const x = s.orientation === 'H' ? s.x + i : s.x;
    const y = s.orientation === 'V' ? s.y + i : s.y;
    cells.push([x, y]);
  }
  return cells;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

/**
 * Полная валидация финального борда:
 * — корабли в границах
 * — нет наложений
 * — корабли не касаются друг друга даже углами
 * — точное соответствие флоту (1×4, 2×3, 3×2, 4×1)
 */
export function validateBoard(ships: ShipPlacement[]): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(ships)) return { ok: false, reason: 'ships is not array' };

  // 1. размер флота
  const expected = new Map<number, number>();
  for (const f of SHIP_FLEET) expected.set(f.size, f.count);
  const actual = new Map<number, number>();
  for (const s of ships) actual.set(s.size, (actual.get(s.size) ?? 0) + 1);
  for (const [size, cnt] of expected) {
    if ((actual.get(size) ?? 0) !== cnt) {
      return { ok: false, reason: `fleet mismatch: expected ${cnt}×${size}` };
    }
  }
  if (actual.size !== expected.size) return { ok: false, reason: 'unknown ship sizes' };

  // 2. валидируем каждую клетку и собираем grid
  const grid: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i];
    if (!['H', 'V'].includes(s.orientation)) return { ok: false, reason: 'bad orientation' };
    if (s.size < 1 || s.size > 4) return { ok: false, reason: 'bad size' };
    const cells = shipCells(s);
    for (const [x, y] of cells) {
      if (!inBounds(x, y)) return { ok: false, reason: 'out of bounds' };
      if (grid[y][x] !== 0) return { ok: false, reason: 'overlap' };
      grid[y][x] = i + 1; // храним 1-based id для отличия от пустых
    }
  }

  // 3. проверка касания — для каждой клетки корабля смотрим 8 соседей,
  //    они должны быть либо пустыми, либо принадлежать ТОМУ ЖЕ кораблю
  for (let i = 0; i < ships.length; i++) {
    const cells = shipCells(ships[i]);
    for (const [x, y] of cells) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const v = grid[ny][nx];
          if (v !== 0 && v !== i + 1) return { ok: false, reason: 'ships touch each other' };
        }
      }
    }
  }
  return { ok: true };
}

/** Создаёт пустой приватный борд (до расстановки). */
export function emptyBoard(): PrivateBoard {
  return { ships: [], attacksReceived: [], placed: false };
}

/** Нормализует и подготавливает борд для сохранения. */
export function buildPrivateBoard(ships: ShipPlacement[]): PrivateBoard {
  return {
    ships: ships.map((s, i) => ({
      ...s,
      id: s.id ?? `s_${i}`,
      hits: 0,
      sunk: false,
    })),
    attacksReceived: [],
    placed: true,
  };
}

/** Уже атаковали клетку? */
function alreadyAttacked(board: PrivateBoard, x: number, y: number): boolean {
  return board.attacksReceived.some((a) => a.x === x && a.y === y);
}

/**
 * Атака по борду defenderBoard в координату (x,y).
 * Мутирует borba: ставит флаги hit/sunk на ship и сохраняет в attacksReceived.
 */
export function applyAttack(defenderBoard: PrivateBoard, x: number, y: number): AttackResult {
  if (!inBounds(x, y)) throw new Error('coords out of bounds');
  if (alreadyAttacked(defenderBoard, x, y)) throw new Error('cell already attacked');

  let hitShip: ShipPlacement | undefined;
  for (const s of defenderBoard.ships) {
    if (shipCells(s).some(([sx, sy]) => sx === x && sy === y)) {
      hitShip = s;
      break;
    }
  }

  if (!hitShip) {
    defenderBoard.attacksReceived.push({ x, y, hit: false });
    return {
      hit: false,
      sunk: false,
      gameOver: false,
      publicCell: { x, y, hit: false },
    };
  }

  hitShip.hits += 1;
  hitShip.sunk = hitShip.hits >= hitShip.size;

  defenderBoard.attacksReceived.push({
    x,
    y,
    hit: true,
    sunkShipId: hitShip.sunk ? hitShip.id : null,
  });

  // Классическое правило: потопленный корабль «окружается точками» — клетки вокруг
  // него гарантированно пусты, поэтому помечаем их промахами автоматически.
  if (hitShip.sunk) {
    const seen = new Set(
      defenderBoard.attacksReceived.map((a) => `${a.x}:${a.y}`),
    );
    for (const [sx, sy] of shipCells(hitShip)) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (!inBounds(nx, ny)) continue;
          const key = `${nx}:${ny}`;
          if (seen.has(key)) continue;
          seen.add(key);
          defenderBoard.attacksReceived.push({ x: nx, y: ny, hit: false, auto: true });
        }
      }
    }
  }

  const gameOver = defenderBoard.ships.every((s) => s.sunk);

  return {
    hit: true,
    sunk: hitShip.sunk,
    sunkShip: hitShip.sunk
      ? { id: hitShip.id, kind: hitShip.kind, cells: shipCells(hitShip) }
      : undefined,
    gameOver,
    publicCell: { x, y, hit: true },
  };
}

/**
 * Случайная авторасстановка (для кнопки «Auto-place»).
 */
export function autoPlace(): ShipPlacement[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships: ShipPlacement[] = [];
    const grid: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    let id = 0;
    let failed = false;

    const placeOne = (size: number, kind: ShipPlacement['kind']) => {
      for (let tries = 0; tries < 200; tries++) {
        const orientation: 'H' | 'V' = Math.random() < 0.5 ? 'H' : 'V';
        const x = Math.floor(Math.random() * (orientation === 'H' ? BOARD_SIZE - size + 1 : BOARD_SIZE));
        const y = Math.floor(Math.random() * (orientation === 'V' ? BOARD_SIZE - size + 1 : BOARD_SIZE));

        let ok = true;
        const cells: Array<[number, number]> = [];
        for (let i = 0; i < size; i++) {
          const cx = orientation === 'H' ? x + i : x;
          const cy = orientation === 'V' ? y + i : y;
          cells.push([cx, cy]);
          // запрещаем касания: проверяем 3×3 вокруг
          for (let dy = -1; dy <= 1 && ok; dy++) {
            for (let dx = -1; dx <= 1 && ok; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
              if (grid[ny][nx] !== 0) ok = false;
            }
          }
        }
        if (!ok) continue;
        for (const [cx, cy] of cells) grid[cy][cx] = 1;
        ships.push({
          id: `s_${id++}`,
          kind,
          size,
          x,
          y,
          orientation,
          hits: 0,
          sunk: false,
        });
        return true;
      }
      return false;
    };

    for (const f of SHIP_FLEET) {
      for (let i = 0; i < f.count; i++) {
        if (!placeOne(f.size, f.kind)) {
          failed = true;
          break;
        }
      }
      if (failed) break;
    }
    if (!failed) return ships;
  }
  throw new Error('autoPlace: failed to generate board');
}

/**
 * Публичная маска борда — то, что клиент знает о ВРАЖЕСКОМ поле.
 * Содержит только полученные атаки (попадания и промахи), плюс координаты потопленных кораблей.
 */
export function publicEnemyView(defender: PrivateBoard) {
  const sunkShips = defender.ships.filter((s) => s.sunk).map((s) => ({
    id: s.id,
    kind: s.kind,
    cells: shipCells(s),
  }));
  return {
    attacks: defender.attacksReceived as AttackCell[],
    sunkShips,
  };
}

/** Публичная маска своего борда (с кораблями и полученными ударами). */
export function publicOwnView(own: PrivateBoard) {
  return {
    ships: own.ships,
    attacks: own.attacksReceived,
  };
}
