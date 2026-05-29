import type { IconName } from '../components/Icon';

// Морские звания по числу побед — для отображения прогресса капитана.
export interface Rank {
  title: string;
  icon: IconName;
  min: number;
  next?: number;
}

const RANKS: Rank[] = [
  { title: 'Юнга', icon: 'anchor', min: 0, next: 3 },
  { title: 'Матрос', icon: 'ship', min: 3, next: 8 },
  { title: 'Боцман', icon: 'compass', min: 8, next: 15 },
  { title: 'Штурман', icon: 'wheel', min: 15, next: 30 },
  { title: 'Капитан', icon: 'medal', min: 30, next: 60 },
  { title: 'Адмирал', icon: 'crown', min: 60 },
];

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
