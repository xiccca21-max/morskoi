import { AttackCell } from '../game/engine/types';

const SIZE = 10;
const key = (x: number, y: number) => `${x},${y}`;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

export interface BotSkill {
  /** Вероятность «добивать» подбитый корабль вместо случайного выстрела (0..1). */
  targetFollow: number;
  /** Использовать «шахматную» эвристику при поиске (находит корабли быстрее). */
  useParity: boolean;
  /**
   * Вероятность оптимально продолжить ЛИНИЮ из 2+ попаданий (0..1).
   * У слабого бота иногда тыкает соседей вразнобой — выглядит по-человечески,
   * но тратит лишние выстрелы и снижает винрейт.
   */
  smartLine: number;
}

/**
 * Сильный бот: добивает всегда, ищет по чётным клеткам, оптимально достраивает линию.
 * Слабый бот: тоже добивает всегда (живой игрок никогда не бросает подбитый корабль),
 * но ищет случайно и иногда тыкает соседей не по линии — даёт игроку реальный шанс.
 * Оба ведут себя как люди: после попадания ищут продолжение слева/справа/сверху/снизу.
 */
export const BOT_SKILL_STRONG: BotSkill = { targetFollow: 1, useParity: true, smartLine: 1 };
export const BOT_SKILL_WEAK: BotSkill = { targetFollow: 1, useParity: false, smartLine: 0.6 };

/** Попадания, которые ещё не закрыты (корабль не потоплен) — их нужно добивать. */
function unresolvedHits(attacks: AttackCell[]): AttackCell[] {
  const hitSet = new Set(attacks.filter((a) => a.hit).map((a) => key(a.x, a.y)));
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
  return attacks.filter((a) => a.hit && !resolved.has(key(a.x, a.y)));
}

/** Есть ли сейчас подбитый, но не добитый корабль (бот в режиме «охоты»). */
export function hasUnresolvedHits(attacks: AttackCell[]): boolean {
  return unresolvedHits(attacks).length > 0;
}

/**
 * Выбор хода бота по истории атак, прилетевших во вражеский борд.
 * `attacks` — это attacksReceived доски соперника (= все выстрелы бота по нему).
 * Гарантированно возвращает не атакованную ранее клетку в пределах поля.
 */
export function chooseBotMove(attacks: AttackCell[], skill: BotSkill): { x: number; y: number } {
  const shot = new Set(attacks.map((a) => key(a.x, a.y)));
  const activeHits = unresolvedHits(attacks);

  // ----- Режим добивания (как живой игрок: ищем продолжение корабля) -----
  if (activeHits.length && Math.random() < skill.targetFollow) {
    const line = lineCandidates(activeHits, shot);
    const neighbours = neighbourCandidates(activeHits, shot);
    // Сильный игрок: если уже видна линия из 2+ попаданий — бьём строго по её концам.
    if (line.length && Math.random() < skill.smartLine) return pick(line);
    // Иначе пробуем соседей подбитой клетки (слева/справа/сверху/снизу).
    if (neighbours.length) return pick(neighbours);
    if (line.length) return pick(line);
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

/** Концы линии из 2+ попаданий — наиболее вероятное продолжение корабля. */
function lineCandidates(activeHits: AttackCell[], shot: Set<string>) {
  const hitKeys = new Set(activeHits.map((a) => key(a.x, a.y)));
  const cells: Array<{ x: number; y: number }> = [];
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
  return cells;
}

/** Соседи подбитой клетки по 4 сторонам — куда бьёт человек, нащупав корабль. */
function neighbourCandidates(activeHits: AttackCell[], shot: Set<string>) {
  const cells: Array<{ x: number; y: number }> = [];
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
