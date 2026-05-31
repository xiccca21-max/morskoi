import type { IconName } from '../components/Icon';

export interface PlayerStats {
  wins: number;
  losses: number;
  games: number;
  wr: number;
  loginStreak?: number;
  referralCount?: number;
}

export interface Achievement {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  /** 0–100 прогресс до открытия (для UI). */
  progress: (s: PlayerStats) => number;
  earned: (s: PlayerStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', icon: 'swords', title: 'Первая кровь', desc: 'Первая победа', progress: (s) => Math.min(100, s.wins * 100), earned: (s) => s.wins >= 1 },
  { id: 'sea_wolf', icon: 'ship', title: 'Морской волк', desc: '10 боёв', progress: (s) => Math.min(100, (s.games / 10) * 100), earned: (s) => s.games >= 10 },
  { id: 'sniper', icon: 'target', title: 'Снайпер', desc: 'Точность 70%+', progress: (s) => s.games >= 5 ? Math.min(100, (s.wr / 70) * 100) : (s.games / 5) * 40, earned: (s) => s.games >= 5 && s.wr >= 70 },
  { id: 'ten_wins', icon: 'medal', title: 'Десятка', desc: '10 побед', progress: (s) => Math.min(100, (s.wins / 10) * 100), earned: (s) => s.wins >= 10 },
  { id: 'fifty_wins', icon: 'crown', title: 'Полста', desc: '50 побед', progress: (s) => Math.min(100, (s.wins / 50) * 100), earned: (s) => s.wins >= 50 },
  { id: 'unbreakable', icon: 'shield', title: 'Несокрушимый', desc: '5 побед без поражений', progress: (s) => s.losses > 0 ? 0 : Math.min(100, (s.wins / 5) * 100), earned: (s) => s.wins >= 5 && s.losses === 0 },
  { id: 'streak_3', icon: 'bolt', title: 'На вахте', desc: 'Стрик входа 3 дня', progress: (s) => Math.min(100, ((s.loginStreak ?? 0) / 3) * 100), earned: (s) => (s.loginStreak ?? 0) >= 3 },
  { id: 'streak_7', icon: 'coins', title: 'Верный капитан', desc: 'Стрик входа 7 дней', progress: (s) => Math.min(100, ((s.loginStreak ?? 0) / 7) * 100), earned: (s) => (s.loginStreak ?? 0) >= 7 },
  { id: 'recruiter', icon: 'share', title: 'Рекрутёр', desc: '1 реферал', progress: (s) => Math.min(100, (s.referralCount ?? 0) * 100), earned: (s) => (s.referralCount ?? 0) >= 1 },
];

export function earnedAchievementIds(stats: PlayerStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.earned(stats)).map((a) => a.id);
}

export function newAchievementIds(before: PlayerStats, after: PlayerStats): Achievement[] {
  const prev = new Set(earnedAchievementIds(before));
  return ACHIEVEMENTS.filter((x) => x.earned(after) && !prev.has(x.id));
}

export function statsFromUser(u: { wins: number; losses: number; loginStreak?: number; referralCount?: number }): PlayerStats {
  const games = u.wins + u.losses;
  return {
    wins: u.wins,
    losses: u.losses,
    games,
    wr: games ? Math.round((u.wins / games) * 100) : 0,
    loginStreak: u.loginStreak ?? 0,
    referralCount: u.referralCount ?? 0,
  };
}

export function newStreakAchievements(prevStreak: number, nextStreak: number): Achievement[] {
  const before = statsFromUser({ wins: 0, losses: 0, loginStreak: prevStreak });
  const after = statsFromUser({ wins: 0, losses: 0, loginStreak: nextStreak });
  return newAchievementIds(before, after).filter((a) => a.id.startsWith('streak_'));
}
