export type CosmeticType = 'title' | 'frame' | 'skin' | 'badge';

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  desc: string;
  /** Условие разблокировки. Пустой объект — доступно всем. */
  req: { referrals?: number; bestWinStreak?: number; wins?: number };
}

export interface CosmeticStats {
  referrals: number;
  bestWinStreak: number;
  wins: number;
}

/**
 * Каталог косметики. Никак не влияет на баланс/игровой процесс — только
 * титулы, рамки профиля, скины кораблей и бейджи. Награды за рефералов
 * (1/3/5/10) и серии побед, как и просили.
 */
export const COSMETICS: CosmeticItem[] = [
  // ===== Титулы =====
  { id: 'captain', type: 'title', name: 'Капитан', desc: 'Базовый титул', req: {} },
  { id: 'onwave', type: 'title', name: 'На волне', desc: '3 победы подряд', req: { bestWinStreak: 3 } },
  { id: 'storm', type: 'title', name: 'Гроза морей', desc: '5 побед подряд', req: { bestWinStreak: 5 } },
  { id: 'admiral', type: 'title', name: 'Адмирал', desc: 'Пригласи 10 друзей', req: { referrals: 10 } },

  // ===== Рамки профиля =====
  { id: 'none', type: 'frame', name: 'Без рамки', desc: 'Стандарт', req: {} },
  { id: 'flag', type: 'frame', name: 'Флаг капитана', desc: 'Пригласи 1 друга', req: { referrals: 1 } },
  { id: 'gold', type: 'frame', name: 'Золотая рамка', desc: '5 побед подряд', req: { bestWinStreak: 5 } },

  // ===== Скины кораблей =====
  { id: 'classic', type: 'skin', name: 'Классика', desc: 'Стандартный флот', req: {} },
  { id: 'corsair', type: 'skin', name: 'Корсар', desc: 'Пригласи 3 друзей (редкий)', req: { referrals: 3 } },
  { id: 'steel', type: 'skin', name: 'Стальной флот', desc: '10 побед', req: { wins: 10 } },

  // ===== Бейджи =====
  { id: 'recruiter', type: 'badge', name: 'Вербовщик', desc: 'Пригласи 1 друга', req: { referrals: 1 } },
  { id: 'tournament', type: 'badge', name: 'Доступ к турниру', desc: 'Пригласи 5 друзей', req: { referrals: 5 } },
];

/** Дефолтные (всегда доступные) предметы по типам — стартовая экипировка. */
export const DEFAULT_EQUIP = { title: 'captain', frame: 'none', skin: 'classic' } as const;

export function isUnlocked(item: CosmeticItem, stats: CosmeticStats): boolean {
  const r = item.req;
  if (r.referrals != null && stats.referrals < r.referrals) return false;
  if (r.bestWinStreak != null && stats.bestWinStreak < r.bestWinStreak) return false;
  if (r.wins != null && stats.wins < r.wins) return false;
  return true;
}
