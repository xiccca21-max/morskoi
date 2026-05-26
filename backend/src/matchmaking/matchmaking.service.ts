import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameService } from '../game/game.service';

/**
 * Matchmaking — упрощённый: ищем второго игрока с той же ставкой.
 * Когда находим пару — атомарно удаляем обоих из очереди и создаём матч.
 */
@Injectable()
export class MatchmakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly game: GameService,
  ) {}

  async enqueue(userId: string, wagerAmount: number) {
    const min = Number(process.env.MIN_WAGER ?? 1);
    const max = Number(process.env.MAX_WAGER ?? 1000);
    if (wagerAmount < min || wagerAmount > max) {
      throw new BadRequestException(`Wager must be between ${min} and ${max}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (Number(user.balance) < wagerAmount) {
      throw new BadRequestException('Insufficient balance for wager');
    }

    // Уже играем?
    const existing = await this.game.findActiveMatchForUser(userId);
    if (existing) {
      return {
        matched: true as const,
        matchId: existing.id,
        opponentId: (existing.player1Id === userId ? existing.player2Id : existing.player1Id) ?? undefined,
      };
    }

    return this.redis.withLock(`mm:wager:${wagerAmount}`, 5000, async () => {
      // ищем кандидата — самый старый, с той же ставкой, не нас
      const candidate = await this.prisma.matchmakingQueue.findFirst({
        where: { wagerAmount, userId: { not: userId } },
        orderBy: { createdAt: 'asc' },
      });

      if (candidate) {
        // удаляем обоих и создаём матч
        await this.prisma.matchmakingQueue.deleteMany({
          where: { userId: { in: [userId, candidate.userId] } },
        });
        const match = await this.game.createMatch(candidate.userId, userId, wagerAmount);
        return { matched: true, matchId: match.id, opponentId: candidate.userId };
      }

      // никого нет — встаём в очередь
      await this.prisma.matchmakingQueue.upsert({
        where: { userId },
        create: { userId, wagerAmount },
        update: { wagerAmount, createdAt: new Date() },
      });
      return { matched: false };
    });
  }

  async leave(userId: string) {
    await this.prisma.matchmakingQueue.deleteMany({ where: { userId } }).catch(() => {});
    return { ok: true };
  }

  async getQueueStatus(userId: string) {
    const entry = await this.prisma.matchmakingQueue.findUnique({ where: { userId } });
    return entry
      ? { inQueue: true, wagerAmount: Number(entry.wagerAmount), since: entry.createdAt }
      : { inQueue: false };
  }
}
