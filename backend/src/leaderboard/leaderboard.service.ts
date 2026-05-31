import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SeasonInfo {
  name: string;
  start: string;
  end: string;
}

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
      start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return { name, start: start.toISOString(), end: end.toISOString() };
  }

  async topByWins(limit = 50) {
    const users = await this.prisma.user.findMany({
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
    const users = await this.prisma.user.findMany({
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
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'FINISHED',
        winnerId: { not: null },
        endedAt: { gte: new Date(start), lt: new Date(end) },
      },
      select: { winnerId: true, prizePool: true, rakeAmount: true },
    });

    const stats = new Map<string, { wins: number; totalWon: number }>();
    for (const m of matches) {
      if (!m.winnerId) continue;
      const cur = stats.get(m.winnerId) ?? { wins: 0, totalWon: 0 };
      cur.wins++;
      cur.totalWon += Number(m.prizePool) - Number(m.rakeAmount);
      stats.set(m.winnerId, cur);
    }

    const sorted = [...stats.entries()]
      .sort((a, b) => b[1].wins - a[1].wins || b[1].totalWon - a[1].totalWon)
      .slice(0, limit);

    if (!sorted.length) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: sorted.map(([id]) => id) } },
      select: { id: true, username: true, firstName: true, avatar: true, losses: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return sorted.map(([id, s], i) => {
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
