import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SeasonInfo {
  name: string;
  start: string;
  end: string;
}

/** Боты и забаненные не участвуют в публичном рейтинге. */
const PUBLIC_PLAYER = { telegramId: { not: { startsWith: 'bot:' } }, banned: false } as const;

/** Юзернеймы, скрытые из топа (LEADERBOARD_HIDDEN_USERS=alice,bob). */
function hiddenUsernames(): string[] {
  const v = process.env.LEADERBOARD_HIDDEN_USERS ?? '';
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Тематические названия сезонов — ротация по месяцам. */
const SEASON_THEMES = [
  'Сезон пиратов',
  'Северный флот',
  'Битва адмиралов',
  'Карибский рейд',
  'Великий шторм',
  'Глубоководье',
  'Тихоокеанский фронт',
  'Арктический конвой',
  'Корсары',
  'Линкоры зари',
  'Багровый прилив',
  'Зимняя гавань',
];

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Текущий сезон: календарный месяц или SEASON_START/SEASON_END из env. */
  getSeason(): SeasonInfo {
    const now = new Date();
    const start = process.env.SEASON_START
      ? new Date(process.env.SEASON_START)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = process.env.SEASON_END
      ? new Date(process.env.SEASON_END)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const name =
      process.env.SEASON_NAME ||
      `${SEASON_THEMES[now.getUTCMonth() % SEASON_THEMES.length]} ${now.getUTCFullYear()}`;
    return { name, start: start.toISOString(), end: end.toISOString() };
  }

  /** Начало текущей недели — последнее воскресенье 00:00 UTC (сброс топа). */
  getWeek(): SeasonInfo {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = воскресенье
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - day);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { name: 'Неделя', start: start.toISOString(), end: end.toISOString() };
  }

  /** Еженедельный рейтинг: победы с последнего воскресенья. */
  async topWeekly(limit = 50) {
    const { start, end } = this.getWeek();
    return this.aggregateWins(new Date(start), new Date(end), limit);
  }

  async topByWins(limit = 50) {
    const hidden = hiddenUsernames();
    const users = await this.prisma.user.findMany({
      where: { ...PUBLIC_PLAYER, ...(hidden.length ? { username: { notIn: hidden } } : {}) },
      orderBy: [{ wins: 'desc' }, { totalWon: 'desc' }],
      take: limit,
      select: {
        id: true, username: true, firstName: true, avatar: true,
        wins: true, losses: true, totalWon: true,
      },
    });
    return users.map((u, i) => this.mapUser(u, i + 1));
  }

  async topByEarnings(limit = 50) {
    const hidden = hiddenUsernames();
    const users = await this.prisma.user.findMany({
      where: { ...PUBLIC_PLAYER, ...(hidden.length ? { username: { notIn: hidden } } : {}) },
      orderBy: [{ totalWon: 'desc' }],
      take: limit,
      select: {
        id: true, username: true, firstName: true, avatar: true,
        wins: true, losses: true, totalWon: true,
      },
    });
    return users.map((u, i) => this.mapUser(u, i + 1));
  }

  /** Сезонный рейтинг: победы за текущий сезон (по finished matches). */
  async topSeason(limit = 50) {
    const { start, end } = this.getSeason();
    return this.aggregateWins(new Date(start), new Date(end), limit);
  }

  /** Победы по завершённым матчам в окне [start, end). Боты исключаются. */
  private async aggregateWins(start: Date, end: Date, limit: number) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'FINISHED',
        winnerId: { not: null },
        endedAt: { gte: start, lt: end },
      },
      select: {
        winnerId: true,
        prizePool: true,
        rakeAmount: true,
        player1: { select: { telegramId: true } },
        player2: { select: { telegramId: true } },
      },
    });

    const stats = new Map<string, { wins: number; totalWon: number }>();
    for (const m of matches) {
      if (!m.winnerId) continue;
      const p1Bot = m.player1?.telegramId?.startsWith('bot:');
      const p2Bot = m.player2?.telegramId?.startsWith('bot:');
      if (p1Bot || p2Bot) continue;
      const cur = stats.get(m.winnerId) ?? { wins: 0, totalWon: 0 };
      cur.wins++;
      cur.totalWon += Number(m.prizePool) - Number(m.rakeAmount);
      stats.set(m.winnerId, cur);
    }

    const sorted = [...stats.entries()]
      .sort((a, b) => b[1].wins - a[1].wins || b[1].totalWon - a[1].totalWon)
      .slice(0, limit);

    if (!sorted.length) return [];

    const hidden = hiddenUsernames();
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: sorted.map(([id]) => id) },
        ...PUBLIC_PLAYER,
        ...(hidden.length ? { username: { notIn: hidden } } : {}),
      },
      select: { id: true, username: true, firstName: true, avatar: true, losses: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return sorted
      .filter(([id]) => byId.has(id)) // отсеиваем ботов и скрытых
      .map(([id, s], i) => {
      const u = byId.get(id);
      return {
        rank: i + 1,
        id,
        name: u?.username ?? u?.firstName ?? `Player-${id.slice(0, 4)}`,
        avatar: u?.avatar ?? null,
        wins: s.wins,
        losses: u?.losses ?? 0,
        totalWon: s.totalWon,
      };
    });
  }

  private mapUser(u: any, rank: number) {
    return {
      rank,
      id: u.id,
      name: u.username ?? u.firstName ?? `Player-${u.id.slice(0, 4)}`,
      avatar: u.avatar,
      wins: u.wins,
      losses: u.losses,
      totalWon: Number(u.totalWon),
    };
  }
}
