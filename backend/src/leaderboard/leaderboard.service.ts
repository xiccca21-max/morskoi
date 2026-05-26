import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async topByWins(limit = 50) {
    const users = await this.prisma.user.findMany({
      orderBy: [{ wins: 'desc' }, { totalWon: 'desc' }],
      take: limit,
      select: {
        id: true,
        username: true,
        firstName: true,
        avatar: true,
        wins: true,
        losses: true,
        totalWon: true,
      },
    });
    return users.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.username ?? u.firstName ?? `Player-${u.id.slice(0, 4)}`,
      avatar: u.avatar,
      wins: u.wins,
      losses: u.losses,
      totalWon: Number(u.totalWon),
    }));
  }

  async topByEarnings(limit = 50) {
    const users = await this.prisma.user.findMany({
      orderBy: [{ totalWon: 'desc' }],
      take: limit,
      select: {
        id: true,
        username: true,
        firstName: true,
        avatar: true,
        wins: true,
        losses: true,
        totalWon: true,
      },
    });
    return users.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.username ?? u.firstName ?? `Player-${u.id.slice(0, 4)}`,
      avatar: u.avatar,
      wins: u.wins,
      losses: u.losses,
      totalWon: Number(u.totalWon),
    }));
  }
}
