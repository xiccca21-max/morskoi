import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, limit = 50) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: { in: ['FINISHED', 'CANCELLED'] },
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      orderBy: { endedAt: 'desc' },
      take: limit,
      include: {
        player1: { select: { id: true, username: true, firstName: true, avatar: true } },
        player2: { select: { id: true, username: true, firstName: true, avatar: true } },
      },
    });
    return matches.map((m) => {
      const isP1 = m.player1Id === userId;
      const opp = isP1 ? m.player2 : m.player1;
      const won = m.winnerId === userId;
      return {
        id: m.id,
        wagerAmount: Number(m.wagerAmount),
        prizePool: Number(m.prizePool),
        rakeAmount: Number(m.rakeAmount),
        status: m.status,
        winnerId: m.winnerId,
        result: m.status === 'CANCELLED' ? 'cancelled' : won ? 'win' : m.winnerId ? 'loss' : 'draw',
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        opponent: opp
          ? {
              id: opp.id,
              name: opp.username ?? opp.firstName ?? `Player-${opp.id.slice(0, 4)}`,
              avatar: opp.avatar,
            }
          : null,
      };
    });
  }
}
