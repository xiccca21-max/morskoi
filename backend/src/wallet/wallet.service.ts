import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TxType, TxStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

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
    private readonly botService: TelegramBotService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return Number(u.balance);
  }

  /** Полный кошелёк: баланс + сколько можно вывести. */
  async getWallet(userId: string): Promise<{ balance: number; withdrawable: number }> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return { balance: Number(u.balance), withdrawable: Number((u as any).withdrawable ?? 0) };
  }

  /**
   * Пополнение. Реальные деньги (real=true) увеличивают и баланс, и withdrawable.
   * Бонус (real=false) — только баланс (вывести нельзя).
   */
  async deposit(userId: string, amount: number, meta?: Record<string, any>, real = true) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    // Дневной лимит депозита (защита/ответственная игра)
    const u0 = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u0) throw new NotFoundException('User not found');
    const limit = Number((u0 as any).dailyDepositLimit ?? 0);
    if (limit > 0) {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const agg = await this.prisma.transaction.aggregate({
        where: { userId, type: TxType.DEPOSIT, createdAt: { gt: since } },
        _sum: { amount: true },
      });
      const usedToday = Number(agg._sum.amount ?? 0);
      if (usedToday + amount > limit) {
        throw new BadRequestException(`Превышен дневной лимит пополнения (${limit} ₽)`);
      }
    }

    return this.redis.withLock(`wallet:${userId}`, 3000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: real
            ? ({ balance: { increment: amount }, withdrawable: { increment: amount } } as any)
            : { balance: { increment: amount } },
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

  /**
   * Заявка на вывод средств. Создаёт WithdrawalRequest (PENDING) и сразу
   * холдит средства (списывает с баланса + withdrawable). Реальная выплата —
   * после ручной/автоматической обработки (статус → PAID).
   */
  async requestWithdrawal(
    userId: string,
    amount: number,
    method: string,
    destination: string,
  ) {
    const MIN = Number(process.env.MIN_WITHDRAW ?? 100);
    const FEE_PERCENT = Number(process.env.WITHDRAW_FEE_PERCENT ?? 0);
    const DAILY_LIMIT = Number(process.env.WITHDRAW_DAILY_LIMIT ?? 50000);

    // Вывод только через @CryptoBot (на привязанный Telegram-аккаунт игрока)
    if (!['TON', 'CRYPTO'].includes(method)) throw new BadRequestException('Вывод доступен только через @CryptoBot');
    if (amount < MIN) throw new BadRequestException(`Минимальная сумма вывода — ${MIN} ₽`);
    // Реквизиты не нужны — выплата идёт на аккаунт пользователя в @CryptoBot
    const dest = destination && destination.trim().length >= 2 ? destination.trim() : '@CryptoBot';

    return this.redis.withLock(`wallet:${userId}`, 5000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('User not found');
        const withdrawable = Number((u as any).withdrawable ?? 0);
        if (withdrawable < amount) {
          throw new BadRequestException(`Доступно к выводу: ${withdrawable.toFixed(0)} ₽`);
        }

        // Суточный лимит вывода
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const agg = await (tx as any).withdrawalRequest.aggregate({
          where: { userId, status: { not: 'REJECTED' }, createdAt: { gt: since } },
          _sum: { amount: true },
        });
        const usedToday = Number(agg._sum.amount ?? 0);
        if (usedToday + amount > DAILY_LIMIT) {
          throw new BadRequestException(`Превышен дневной лимит вывода (${DAILY_LIMIT} ₽)`);
        }

        const fee = +(amount * (FEE_PERCENT / 100)).toFixed(2);
        const net = +(amount - fee).toFixed(2);

        // Холдим средства
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount }, withdrawable: { decrement: amount } } as any,
        });

        const wr = await (tx as any).withdrawalRequest.create({
          data: { userId, amount, fee, net, method, destination: dest, status: 'PENDING' },
        });

        await tx.transaction.create({
          data: {
            userId,
            type: TxType.WITHDRAW,
            amount,
            status: TxStatus.PENDING,
            meta: JSON.stringify({ withdrawalId: wr.id, method, fee, net }),
          },
        });

        return { id: wr.id, amount, fee, net, status: 'PENDING' };
      });
    });
  }

  /** Список заявок на вывод пользователя. */
  async listWithdrawals(userId: string) {
    return (this.prisma as any).withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Создать «висящий» депозит под внешний инвойс провайдера.
   * Деньги НЕ зачисляются — ждём вебхук об оплате.
   */
  async createPendingDeposit(userId: string, amount: number, invoiceId: string, provider: string) {
    return this.prisma.transaction.create({
      data: {
        userId,
        type: TxType.DEPOSIT,
        amount,
        status: TxStatus.PENDING,
        meta: JSON.stringify({ invoiceId, provider }),
      },
    });
  }

  /**
   * Зачислить депозит по факту оплаты инвойса (идемпотентно).
   * Находит PENDING-депозит с этим invoiceId и проводит его.
   */
  async completeDepositByInvoice(userId: string, invoiceId: string, amount: number) {
    return this.redis.withLock(`wallet:${userId}`, 4000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const pending = await tx.transaction.findFirst({
          where: { userId, type: TxType.DEPOSIT, status: TxStatus.PENDING, meta: { contains: invoiceId } },
        });
        if (!pending) return { credited: false };
        await tx.transaction.update({ where: { id: pending.id }, data: { status: TxStatus.COMPLETED } });
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amount }, withdrawable: { increment: amount } } as any,
        });
        return { credited: true };
      });
    });
  }

  /** Получить заявку на вывод по id. */
  async getWithdrawal(id: string) {
    return (this.prisma as any).withdrawalRequest.findUnique({ where: { id } });
  }

  /**
   * Завершить заявку на вывод: PAID (выплачено) или REJECTED (возврат средств).
   * При отклонении удержанные деньги возвращаются на баланс.
   */
  async resolveWithdrawal(id: string, status: 'PAID' | 'REJECTED', note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const wr = await (tx as any).withdrawalRequest.findUnique({ where: { id } });
      if (!wr) throw new NotFoundException('Заявка не найдена');
      if (wr.status === 'PAID' || wr.status === 'REJECTED') {
        return wr; // уже обработана — идемпотентность
      }
      if (status === 'PAID') {
        await (tx as any).withdrawalRequest.update({
          where: { id },
          data: { status: 'PAID', processedAt: new Date() },
        });
        await tx.transaction.updateMany({
          where: { userId: wr.userId, type: TxType.WITHDRAW, status: TxStatus.PENDING, meta: { contains: id } },
          data: { status: TxStatus.COMPLETED },
        });
      } else {
        // Возврат удержанных средств
        await tx.user.update({
          where: { id: wr.userId },
          data: { balance: { increment: wr.amount }, withdrawable: { increment: wr.amount } } as any,
        });
        await (tx as any).withdrawalRequest.update({
          where: { id },
          data: { status: 'REJECTED', note: note ?? null, processedAt: new Date() },
        });
        await tx.transaction.updateMany({
          where: { userId: wr.userId, type: TxType.WITHDRAW, status: TxStatus.PENDING, meta: { contains: id } },
          data: { status: TxStatus.FAILED },
        });
      }
      return { ...wr, status };
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

          // withdrawable не может превышать оставшийся баланс
          for (const [u, id] of [[p1, p1Id], [p2, p2Id]] as const) {
            const w = Number((u as any).withdrawable ?? 0);
            const newBal = Number(u!.balance) - amount;
            if (w > newBal) {
              await tx.user.update({ where: { id }, data: { withdrawable: Math.max(0, newBal) } as any });
            }
          }

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
          // Идемпотентность: если матч уже рассчитан — не платим повторно.
          const current = await tx.match.findUnique({
            where: { id: matchId },
            select: { status: true, winnerId: true, rakeAmount: true, prizePool: true },
          });
          if (current?.status === 'FINISHED') {
            return { winnerPayout: Number(current.prizePool) - Number(current.rakeAmount), rake: Number(current.rakeAmount), alreadySettled: true };
          }

          if (winnerId === null) {
            // refund обоим
            await tx.user.update({
              where: { id: p1Id },
              data: { balance: { increment: wagerAmount }, withdrawable: { increment: wagerAmount }, draws: { increment: 1 } } as any,
            });
            await tx.user.update({
              where: { id: p2Id },
              data: { balance: { increment: wagerAmount }, withdrawable: { increment: wagerAmount }, draws: { increment: 1 } } as any,
            });
            await tx.transaction.createMany({
              data: [
                { userId: p1Id, matchId, type: TxType.WAGER_REFUND, amount: wagerAmount },
                { userId: p2Id, matchId, type: TxType.WAGER_REFUND, amount: wagerAmount },
              ],
            });
            await tx.match.update({
              where: { id: matchId },
              data: { winnerId: null, endedAt: new Date(), status: 'FINISHED' },
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
              withdrawable: { increment: winnerPayout },
              wins: { increment: 1 },
              totalWon: { increment: winnerPayout },
            } as any,
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

          // Пуш победителю после транзакции
          setImmediate(() => {
            this.botService.notifyPayout(winnerId, winnerPayout).catch(() => {});
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
