// Дублируем типы движка с backend для type-safety на клиенте

export type Orientation = 'H' | 'V';
export type ShipKind = 'battleship' | 'cruiser' | 'destroyer' | 'submarine';

export interface ShipPlacement {
  id: string;
  kind: ShipKind;
  size: number;
  x: number;
  y: number;
  orientation: Orientation;
  hits?: number;
  sunk?: boolean;
}

export interface AttackCell {
  x: number;
  y: number;
  hit: boolean;
  sunkShipId?: string | null;
  auto?: boolean;
}

export const BOARD_SIZE = 10;

export const SHIP_FLEET = [
  { kind: 'battleship' as ShipKind, size: 4, count: 1, label: 'Линкор' },
  { kind: 'cruiser'    as ShipKind, size: 3, count: 2, label: 'Крейсер' },
  { kind: 'destroyer'  as ShipKind, size: 2, count: 3, label: 'Эсминец' },
  { kind: 'submarine'  as ShipKind, size: 1, count: 4, label: 'Подлодка' },
];

export interface MatchState {
  matchId: string;
  status: 'PENDING' | 'PLACEMENT' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  gameStatus: 'PLACEMENT' | 'IN_PROGRESS' | 'FINISHED';
  wagerAmount: number;
  prizePool: number;
  rakeAmount: number;
  winnerId: string | null;
  currentTurn: string | null;
  turnDeadline: string | null;
  me: {
    userId: string;
    own: { ships: ShipPlacement[]; attacks: AttackCell[] };
  };
  enemy: {
    userId: string;
    view: { attacks: AttackCell[]; sunkShips: any[] };
  };
  opponentReady: boolean;
}

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

export function shipCells(s: ShipPlacement): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < s.size; i++) {
    const x = s.orientation === 'H' ? s.x + i : s.x;
    const y = s.orientation === 'V' ? s.y + i : s.y;
    cells.push([x, y]);
  }
  return cells;
}

/** Локальная (превентивная) валидация расстановки. Окончательно проверяет сервер. */
export function validatePlacement(ships: ShipPlacement[]): { ok: boolean; reason?: string } {
  const grid: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i];
    for (const [x, y] of shipCells(s)) {
      if (!inBounds(x, y)) return { ok: false, reason: 'Корабль за границей' };
      if (grid[y][x] !== 0) return { ok: false, reason: 'Корабли пересекаются' };
      grid[y][x] = i + 1;
    }
  }
  // касания
  for (let i = 0; i < ships.length; i++) {
    for (const [x, y] of shipCells(ships[i])) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const v = grid[ny][nx];
          if (v !== 0 && v !== i + 1) return { ok: false, reason: 'Корабли касаются' };
        }
      }
    }
  }
  return { ok: true };
}

/** Локальная авторасстановка. */
export function autoPlaceLocal(): ShipPlacement[] {
  for (let attempt = 0; attempt < 300; attempt++) {
    const ships: ShipPlacement[] = [];
    const grid: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    let id = 0;
    let failed = false;
    const place = (size: number, kind: ShipKind) => {
      for (let t = 0; t < 200; t++) {
        const orientation: Orientation = Math.random() < 0.5 ? 'H' : 'V';
        const x = Math.floor(Math.random() * (orientation === 'H' ? BOARD_SIZE - size + 1 : BOARD_SIZE));
        const y = Math.floor(Math.random() * (orientation === 'V' ? BOARD_SIZE - size + 1 : BOARD_SIZE));
        let ok = true;
        const cells: Array<[number, number]> = [];
        for (let i = 0; i < size; i++) {
          const cx = orientation === 'H' ? x + i : x;
          const cy = orientation === 'V' ? y + i : y;
          cells.push([cx, cy]);
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
        ships.push({ id: `s_${id++}`, kind, size, x, y, orientation });
        return true;
      }
      return false;
    };
    for (const f of SHIP_FLEET) {
      for (let i = 0; i < f.count; i++) {
        if (!place(f.size, f.kind)) { failed = true; break; }
      }
      if (failed) break;
    }
    if (!failed) return ships;
  }
  throw new Error('auto place failed');
}
