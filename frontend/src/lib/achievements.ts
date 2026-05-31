import type { IconName } from '../components/Icon';

export interface Achievement {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  earned: (s: { wins: number; losses: number; games: number; wr: number }) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', icon: 'swords', title: 'Первая кровь', desc: 'Первая победа', earned: (s) => s.wins >= 1 },
  { id: 'sea_wolf', icon: 'ship', title: 'Морской волк', desc: '10 боёв', earned: (s) => s.games >= 10 },
  { id: 'sniper', icon: 'target', title: 'Снайпер', desc: 'Точность 70%+', earned: (s) => s.games >= 5 && s.wr >= 70 },
  { id: 'ten_wins', icon: 'medal', title: 'Десятка', desc: '10 побед', earned: (s) => s.wins >= 10 },
  { id: 'fifty_wins', icon: 'crown', title: 'Полста', desc: '50 побед', earned: (s) => s.wins >= 50 },
  { id: 'unbreakable', icon: 'shield', title: 'Несокрушимый', desc: '5 побед без поражений', earned: (s) => s.wins >= 5 && s.losses === 0 },
];

export function earnedAchievementIds(stats: { wins: number; losses: number; games: number; wr: number }): string[] {
  return ACHIEVEMENTS.filter((a) => a.earned(stats)).map((a) => a.id);
}

export function newAchievementIds(
  before: { wins: number; losses: number },
  after: { wins: number; losses: number },
): Achievement[] {
  const b = { ...before, games: before.wins + before.losses, wr: pct(before) };
  const a = { ...after, games: after.wins + after.losses, wr: pct(after) };
  const prev = new Set(earnedAchievementIds(b));
  return ACHIEVEMENTS.filter((x) => x.earned(a) && !prev.has(x.id));
}

function pct(s: { wins: number; losses: number }) {
  const t = s.wins + s.losses;
  return t ? Math.round((s.wins / t) * 100) : 0;
}
