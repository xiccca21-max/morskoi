import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TxType, TxStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * WalletService — атомарные операции с балансом.
 * Все методы изменения баланса оборачиваются:
 *   1. Redis lock на userId (защита от race condition между процессами/инстансами)
 *   2. prisma.$transaction — атомарность update + создание Transaction
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return Number(u.balance);
  }

  async deposit(userId: string, amount: number, meta?: Record<string, any>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    return this.redis.withLock(`wallet:${userId}`, 3000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TxType.DEPOSIT,
            amount,
            status: TxStatus.COMPLETED,
            meta: meta ? JSON.stringify(meta) : null,
          },
        });
        return Number(u.balance);
      });
    });
  }

  async withdraw(userId: string, amount: number, meta?: Record<string, any>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    return this.redis.withLock(`wallet:${userId}`, 3000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('User not found');
        if (Number(u.balance) < amount) throw new BadRequestException('Insufficient balance');

        const updated = await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount } },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TxType.WITHDRAW,
            amount,
            status: TxStatus.COMPLETED,
            meta: meta ? JSON.stringify(meta) : null,
          },
        });
        return Number(updated.balance);
      });
    });
  }

  /**
   * Списать ставку у двух игроков атомарно.
   * Используется при старте матча. Создаёт WAGER_LOCK транзакции.
   * При недостаточном балансе у одного — ничего не списывается.
   */
  async lockWagerForMatch(matchId: string, p1Id: string, p2Id: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    // Сортируем id чтобы избежать deadlock при пересекающихся локах двух процессов
    const ordered = [p1Id, p2Id].sort();
    return this.redis.withLock(`wallet:${ordered[0]}`, 5000, async () => {
      return this.redis.withLock(`wallet:${ordered[1]}`, 5000, async () => {
        return this.prisma.$transaction(async (tx) => {
          const [p1, p2] = await Promise.all([
            tx.user.findUnique({ where: { id: p1Id } }),
            tx.user.findUnique({ where: { id: p2Id } }),
          ]);
          if (!p1 || !p2) throw new NotFoundException('Player not found');
          if (Number(p1.balance) < amount) throw new BadRequestException('Player1 insufficient balance');
          if (Number(p2.balance) < amount) throw new BadRequestException('Player2 insufficient balance');

          await tx.user.update({
            where: { id: p1Id },
            data: { balance: { decrement: amount }, totalWagered: { increment: amount } },
          });
          await tx.user.update({
            where: { id: p2Id },
            data: { balance: { decrement: amount }, totalWagered: { increment: amount } },
          });

          await tx.transaction.createMany({
            data: [
              { userId: p1Id, matchId, type: TxType.WAGER_LOCK, amount, status: TxStatus.COMPLETED },
              { userId: p2Id, matchId, type: TxType.WAGER_LOCK, amount, status: TxStatus.COMPLETED },
            ],
          });
        });
      });
    });
  }

  /**
   * Выплата победителю + забор рейка платформой.
   * winnerId === null → ничья: вернуть ставку обоим (без рейка).
   */
  async settleMatch(
    matchId: string,
    p1Id: string,
    p2Id: string,
    wagerAmount: number,
    winnerId: string | null,
    rakePercent: number,
  ) {
    const ordered = [p1Id, p2Id].sort();
    return this.redis.withLock(`wallet:${ordered[0]}`, 5000, async () => {
      return this.redis.withLock(`wallet:${ordered[1]}`, 5000, async () => {
        return this.prisma.$transaction(async (tx) => {
          if (winnerId === null) {
            // refund обоим
            await tx.user.update({
              where: { id: p1Id },
              data: { balance: { increment: wagerAmount }, draws: { increment: 1 } },
            });
            await tx.user.update({
              where: { id: p2Id },
              data: { balance: { increment: wagerAmount }, draws: { increment: 1 } },
            });
            await tx.transaction.createMany({
              data: [
                { userId: p1Id, matchId, type: TxType.WAGER_REFUND, amount: wagerAmount },
                { userId: p2Id, matchId, type: TxType.WAGER_REFUND, amount: wagerAmount },
              ],
            });
            return { winnerPayout: 0, rake: 0 };
          }

          const pool = wagerAmount * 2;
          const rake = +(pool * (rakePercent / 100)).toFixed(2);
          const winnerPayout = +(pool - rake).toFixed(2);
          const loserId = winnerId === p1Id ? p2Id : p1Id;

          await tx.user.update({
            where: { id: winnerId },
            data: {
              balance: { increment: winnerPayout },
              wins: { increment: 1 },
              totalWon: { increment: winnerPayout },
            },
          });
          await tx.user.update({
            where: { id: loserId },
            data: { losses: { increment: 1 } },
          });

          await tx.transaction.createMany({
            data: [
              { userId: winnerId, matchId, type: TxType.PAYOUT, amount: winnerPayout },
              { userId: winnerId, matchId, type: TxType.RAKE,   amount: rake, meta: JSON.stringify({ note: 'platform fee' }) },
            ],
          });

          await tx.match.update({
            where: { id: matchId },
            data: { rakeAmount: rake, prizePool: pool, winnerId, endedAt: new Date(), status: 'FINISHED' },
          });

          return { winnerPayout, rake };
        });
      });
    });
  }

  async listTransactions(userId: string, limit = 50) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
