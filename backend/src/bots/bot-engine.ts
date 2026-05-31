import { AttackCell } from '../game/engine/types';

const SIZE = 10;
const key = (x: number, y: number) => `${x},${y}`;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

export interface BotSkill {
  /** Вероятность «добивать» подбитый корабль вместо случайного выстрела (0..1). */
  targetFollow: number;
  /** Использовать «шахматную» эвристику при поиске (бьёт эффективнее). */
  useParity: boolean;
}

/** Сильный бот: всегда добивает, ищет по чётным клеткам — высокий винрейт. */
export const BOT_SKILL_STRONG: BotSkill = { targetFollow: 1, useParity: true };
/** Слабый бот: часто «мажет» по логике — даёт игроку шанс победить. */
export const BOT_SKILL_WEAK: BotSkill = { targetFollow: 0.4, useParity: false };

/**
 * Выбор хода бота по истории атак, прилетевших во вражеский борд.
 * `attacks` — это attacksReceived доски соперника (= все выстрелы бота по нему).
 * Гарантированно возвращает не атакованную ранее клетку в пределах поля.
 */
export function chooseBotMove(attacks: AttackCell[], skill: BotSkill): { x: number; y: number } {
  const shot = new Set(attacks.map((a) => key(a.x, a.y)));
  const hitSet = new Set(attacks.filter((a) => a.hit).map((a) => key(a.x, a.y)));

  // Помечаем попадания по уже потопленным кораблям как «закрытые»:
  // от клетки с sunkShipId обходим связные попадания.
  const resolved = new Set<string>();
  const floodSunk = (sx: number, sy: number) => {
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const k = key(x, y);
      if (resolved.has(k) || !hitSet.has(k)) continue;
      resolved.add(k);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  };
  for (const a of attacks) if (a.hit && a.sunkShipId) floodSunk(a.x, a.y);

  const activeHits = attacks.filter((a) => a.hit && !resolved.has(key(a.x, a.y)));

  // ----- Режим добивания -----
  if (activeHits.length && Math.random() < skill.targetFollow) {
    const cand = targetCandidates(activeHits, shot);
    if (cand.length) return pick(cand);
  }

  // ----- Режим поиска -----
  const free: Array<{ x: number; y: number }> = [];
  const parityFree: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (shot.has(key(x, y))) continue;
      free.push({ x, y });
      if ((x + y) % 2 === 0) parityFree.push({ x, y });
    }
  }
  if (skill.useParity && parityFree.length) return pick(parityFree);
  if (free.length) return pick(free);
  // подстраховка (поле не может быть полностью закрыто до конца игры)
  return { x: 0, y: 0 };
}

function targetCandidates(activeHits: AttackCell[], shot: Set<string>) {
  const hitKeys = new Set(activeHits.map((a) => key(a.x, a.y)));
  const cells: Array<{ x: number; y: number }> = [];

  // 2+ попадания на линии — продолжаем линию в обе стороны.
  for (const h of activeHits) {
    if (hitKeys.has(key(h.x + 1, h.y)) || hitKeys.has(key(h.x - 1, h.y))) {
      for (const dx of [1, -1]) {
        let nx = h.x + dx;
        while (inB(nx, h.y) && hitKeys.has(key(nx, h.y))) nx += dx;
        if (inB(nx, h.y) && !shot.has(key(nx, h.y))) cells.push({ x: nx, y: h.y });
      }
    }
    if (hitKeys.has(key(h.x, h.y + 1)) || hitKeys.has(key(h.x, h.y - 1))) {
      for (const dy of [1, -1]) {
        let ny = h.y + dy;
        while (inB(h.x, ny) && hitKeys.has(key(h.x, ny))) ny += dy;
        if (inB(h.x, ny) && !shot.has(key(h.x, ny))) cells.push({ x: h.x, y: ny });
      }
    }
  }
  if (cells.length) return cells;

  // Одиночное попадание — пробуем 4 соседей.
  for (const h of activeHits) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = h.x + dx;
      const ny = h.y + dy;
      if (inB(nx, ny) && !shot.has(key(nx, ny))) cells.push({ x: nx, y: ny });
    }
  }
  return cells;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
