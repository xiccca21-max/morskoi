import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameService } from '../game/game.service';
import { MatchEventsService } from '../common/match-events.service';
import { assertCanPlay } from '../common/responsible-gaming';

/**
 * Matchmaking — ищем второго игрока с той же (или близкой) ставкой.
 * После MM_FLEX_WAIT_SEC расширяем диапазон ±MM_FLEX_PCT.
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger('Matchmaking');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly game: GameService,
    private readonly matchEvents: MatchEventsService,
  ) {}

  async enqueue(userId: string, wagerAmount: number) {
    const min = Number(process.env.MIN_WAGER ?? 100);
    const max = Number(process.env.MAX_WAGER ?? 10000);
    if (wagerAmount < min || wagerAmount > max) {
      throw new BadRequestException(`Wager must be between ${min} and ${max}`);
    }

    await assertCanPlay(this.prisma, userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (Number(user.balance) < wagerAmount) {
      throw new BadRequestException('Insufficient balance for wager');
    }

    const existing = await this.game.findActiveMatchForUser(userId);
    if (existing) {
      return {
        matched: true as const,
        matchId: existing.id,
        opponentId: (existing.player1Id === userId ? existing.player2Id : existing.player1Id) ?? undefined,
      };
    }

    return this.redis.withLock(`mm:wager:${wagerAmount}`, 5000, async () => {
      const exact = await this.prisma.matchmakingQueue.findFirst({
        where: { wagerAmount, userId: { not: userId } },
        orderBy: { createdAt: 'asc' },
      });
      if (exact) {
        return this.createMatchFromQueue(userId, exact.userId, Number(exact.wagerAmount));
      }

      const flex = await this.findFlexibleCandidate(userId, wagerAmount);
      if (flex) {
        const matchWager = Math.min(wagerAmount, Number(flex.wagerAmount));
        return this.createMatchFromQueue(userId, flex.userId, matchWager);
      }

      await this.prisma.matchmakingQueue.upsert({
        where: { userId },
        create: { userId, wagerAmount },
        update: { wagerAmount, createdAt: new Date() },
      });
      return { matched: false as const };
    });
  }

  /** Периодически матчим игроков из очереди с близкими ставками. */
  @Cron('*/20 * * * * *')
  async flexMatchTick() {
    const entries = await this.prisma.matchmakingQueue.findMany({ orderBy: { createdAt: 'asc' } });
    if (entries.length < 2) return;

    const waitSec = Number(process.env.MM_FLEX_WAIT_SEC ?? 30);
    const flexPct = Number(process.env.MM_FLEX_PCT ?? 0.1);
    const cutoff = Date.now() - waitSec * 1000;
    const matched = new Set<string>();

    for (const a of entries) {
      if (matched.has(a.userId)) continue;
      if (a.createdAt.getTime() > cutoff) continue;

      for (const b of entries) {
        if (b.userId === a.userId || matched.has(b.userId)) continue;
        if (b.createdAt.getTime() > cutoff) continue;

        const wa = Number(a.wagerAmount);
        const wb = Number(b.wagerAmount);
        const lo = Math.min(wa, wb);
        const hi = Math.max(wa, wb);
        if (hi > lo * (1 + flexPct)) continue;

        try {
          await this.redis.withLock(`mm:flex:${a.userId}:${b.userId}`, 5000, async () => {
            const stillA = await this.prisma.matchmakingQueue.findUnique({ where: { userId: a.userId } });
            const stillB = await this.prisma.matchmakingQueue.findUnique({ where: { userId: b.userId } });
            if (!stillA || !stillB) return;
            await this.createMatchFromQueue(a.userId, b.userId, lo);
            matched.add(a.userId);
            matched.add(b.userId);
          });
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          if (msg.includes('Insufficient balance')) {
            await this.prisma.matchmakingQueue.deleteMany({
              where: { userId: { in: [a.userId, b.userId] } },
            }).catch(() => undefined);
            this.logger.warn(`Removed queue entries: insufficient balance (${a.userId}, ${b.userId})`);
          }
        }
        break;
      }
    }
  }

  private async findFlexibleCandidate(userId: string, wagerAmount: number) {
    const waitSec = Number(process.env.MM_FLEX_WAIT_SEC ?? 30);
    const flexPct = Number(process.env.MM_FLEX_PCT ?? 0.1);
    const cutoff = new Date(Date.now() - waitSec * 1000);
    const minWager = wagerAmount * (1 - flexPct);
    const maxWager = wagerAmount * (1 + flexPct);

    const candidates = await this.prisma.matchmakingQueue.findMany({
      where: {
        userId: { not: userId },
        wagerAmount: { gte: minWager, lte: maxWager },
        createdAt: { lte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    if (!candidates.length) return null;

    return candidates.reduce((best, c) =>
      Math.abs(Number(c.wagerAmount) - wagerAmount) < Math.abs(Number(best.wagerAmount) - wagerAmount)
        ? c
        : best,
    );
  }

  private async createMatchFromQueue(userId: string, opponentId: string, wagerAmount: number) {
    await assertCanPlay(this.prisma, userId);
    await assertCanPlay(this.prisma, opponentId);

    const [u1, u2] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { id: opponentId } }),
    ]);
    if (!u1 || !u2) throw new NotFoundException('User not found');
    if (Number(u1.balance) < wagerAmount || Number(u2.balance) < wagerAmount) {
      throw new BadRequestException('Insufficient balance for wager');
    }

    await this.prisma.matchmakingQueue.deleteMany({
      where: { userId: { in: [userId, opponentId] } },
    });
    const match = await this.game.createMatch(opponentId, userId, wagerAmount);
    void this.matchEvents.notifyMatchFound(match.id);
    return { matched: true as const, matchId: match.id, opponentId };
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
