// Общие типы игрового движка
export type Orientation = 'H' | 'V';
export type ShipKind = 'battleship' | 'cruiser' | 'destroyer' | 'submarine';

export interface ShipPlacement {
  id: string;            // уникальный id корабля в борде
  kind: ShipKind;
  size: number;          // 4 | 3 | 2 | 1
  x: number;             // 0..9, верхний-левый
  y: number;             // 0..9
  orientation: Orientation;
  hits: number;          // сколько клеток подбито
  sunk: boolean;
}

export interface PrivateBoard {
  ships: ShipPlacement[];          // никогда не отправляется сопернику
  attacksReceived: AttackCell[];   // удары, прилетевшие в этот борд
  placed: boolean;
}

export interface AttackCell {
  x: number;
  y: number;
  hit: boolean;
  sunkShipId?: string | null;
}

export interface AttackResult {
  hit: boolean;
  sunk: boolean;
  sunkShip?: { id: string; kind: ShipKind; cells: Array<[number, number]> };
  gameOver: boolean;
  // публичный для соперника результат (без раскрытия "что рядом")
  publicCell: { x: number; y: number; hit: boolean };
}

export const BOARD_SIZE = 10;

export const SHIP_FLEET: { kind: ShipKind; size: number; count: number }[] = [
  { kind: 'battleship', size: 4, count: 1 },
  { kind: 'cruiser',    size: 3, count: 2 },
  { kind: 'destroyer',  size: 2, count: 3 },
  { kind: 'submarine',  size: 1, count: 4 },
];

export const TOTAL_SHIP_CELLS = SHIP_FLEET.reduce((s, f) => s + f.size * f.count, 0); // 20
