import type { IconName } from '../components/Icon';

// Морские звания по числу побед — для отображения прогресса капитана.
export interface Rank {
  title: string;
  icon: IconName;
  min: number;
  next?: number;
}

export const ALL_RANKS: Rank[] = [
  { title: 'Юнга', icon: 'anchor', min: 0, next: 10 },
  { title: 'Матрос', icon: 'ship', min: 10, next: 30 },
  { title: 'Боцман', icon: 'compass', min: 30, next: 50 },
  { title: 'Штурман', icon: 'wheel', min: 50, next: 100 },
  { title: 'Капитан', icon: 'medal', min: 100, next: 200 },
  { title: 'Адмирал', icon: 'crown', min: 200 },
];

const RANKS = ALL_RANKS;

export function getRank(wins: number): Rank {
  let r = RANKS[0];
  for (const rank of RANKS) if (wins >= rank.min) r = rank;
  return r;
}

export function rankProgress(wins: number): number {
  const r = getRank(wins);
  if (!r.next) return 100;
  return Math.min(100, Math.round(((wins - r.min) / (r.next - r.min)) * 100));
}

/** Следующее звание (или null, если уже максимум). */
export function nextRank(wins: number): Rank | null {
  const cur = getRank(wins);
  const idx = RANKS.findIndex((r) => r.title === cur.title);
  return RANKS[idx + 1] ?? null;
}

/** Сколько побед осталось до следующего звания. */
export function winsToNext(wins: number): number {
  const cur = getRank(wins);
  if (!cur.next) return 0;
  return Math.max(0, cur.next - wins);
}
