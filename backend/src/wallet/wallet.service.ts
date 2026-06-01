import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TxType, TxStatus } from '../common/enums';
import { AuditService } from '../common/audit.service';
import { roundRub } from '../common/money';
import { txMetaMatches } from '../common/transaction-meta';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import {
  USDT_NETWORKS,
  USDT_NETWORK_IDS,
  methodForNetwork,
  validateUsdtAddress,
  type UsdtNetwork,
} from './withdraw.constants';

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
    private readonly audit: AuditService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return Number(u.balance);
  }

  /** Полный кошелёк. Бонусов нет — весь баланс доступен к выводу. */
  async getWallet(userId: string): Promise<{ balance: number; withdrawable: number }> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return { balance: Number(u.balance), withdrawable: Number((u as any).withdrawable ?? u.balance) };
  }

  /**
   * Пополнение. Бонусных (невыводимых) денег в игре нет — любое начисление
   * увеличивает и баланс, и доступную к выводу сумму. Параметр `real` оставлен
   * для совместимости и больше ни на что не влияет.
   */
  async deposit(userId: string, amount: number, meta?: Record<string, any>, real = true) {
    amount = roundRub(amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.redis.withLock(`wallet:${userId}`, 3000, async () => {
      // Дневной лимит — внутри лока, чтобы параллельные депозиты не обходили cap.
      const u0 = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u0) throw new NotFoundException('User not found');
      const limit = Number((u0 as any).dailyDepositLimit ?? 0);
      if (limit > 0) {
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const agg = await this.prisma.transaction.aggregate({
          where: { userId, type: TxType.DEPOSIT, createdAt: { gt: since }, status: TxStatus.COMPLETED },
          _sum: { amount: true },
        });
        const usedToday = Number(agg._sum.amount ?? 0);
        if (usedToday + amount > limit) {
          throw new BadRequestException(`Превышен дневной лимит пополнения (${limit} ₽)`);
        }
      }

      return this.prisma.$transaction(async (tx) => {
        void real;
        const u = await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amount }, withdrawable: { increment: amount } } as any,
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
    }).then((balance) => {
      this.audit.log(userId, 'DEPOSIT', { amount, real, ...(meta ?? {}) });
      return balance;
    });
  }

  /**
   * Заявка на вывод USDT на внешний кошелёк.
   * Создаёт WithdrawalRequest (PENDING) и сразу холдит средства.
   * Выплата в USDT — вручную, до 24 часов.
   */
  async requestWithdrawal(
    userId: string,
    amount: number,
    network: string,
    address: string,
  ) {
    const MIN = Number(process.env.MIN_WITHDRAW ?? 100);
    const FEE_PERCENT = Number(process.env.WITHDRAW_FEE_PERCENT ?? 0);
    const DAILY_LIMIT = Number(process.env.WITHDRAW_DAILY_LIMIT ?? 50000);

    if (!USDT_NETWORK_IDS.includes(network as UsdtNetwork)) {
      throw new BadRequestException('Выберите сеть USDT');
    }
    const dest = address.trim();
    try {
      validateUsdtAddress(network, dest);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Некорректный адрес');
    }
    amount = roundRub(amount);
    if (amount < MIN) throw new BadRequestException(`Минимальная сумма вывода — ${MIN} ₽`);

    const method = methodForNetwork(network as UsdtNetwork);

    const result = await this.redis.withLock(`wallet:${userId}`, 5000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('User not found');
        const available = Number(u.balance);
        if (available < amount) {
          throw new BadRequestException(`Доступно к выводу: ${available.toFixed(0)} ₽`);
        }

        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const agg = await (tx as any).withdrawalRequest.aggregate({
          where: { userId, status: { not: 'REJECTED' }, createdAt: { gt: since } },
          _sum: { amount: true },
        });
        const usedToday = Number(agg._sum.amount ?? 0);
        if (usedToday + amount > DAILY_LIMIT) {
          throw new BadRequestException(`Превышен дневной лимит вывода (${DAILY_LIMIT} ₽)`);
        }

        const fee = roundRub(amount * (FEE_PERCENT / 100));
        const net = roundRub(amount - fee);

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
            meta: JSON.stringify({ withdrawalId: wr.id, method, network, address: dest, fee, net }),
          },
        });

        return { id: wr.id, amount, fee, net, method, network, address: dest, status: 'PENDING' as const };
      });
    });

    setImmediate(() => {
      this.audit.log(userId, 'WITHDRAW_REQUEST', { ...result });
    });

    return result;
  }

  listWithdrawNetworks() {
    return USDT_NETWORK_IDS.map((id) => ({
      id,
      label: USDT_NETWORKS[id].label,
      hint: USDT_NETWORKS[id].hint,
    }));
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
  async createPendingDeposit(
    userId: string,
    amountRub: number,
    invoiceId: string,
    provider: string,
    extra?: Record<string, unknown>,
  ) {
    return this.prisma.transaction.create({
      data: {
        userId,
        type: TxType.DEPOSIT,
        amount: amountRub,
        status: TxStatus.PENDING,
        meta: JSON.stringify({ invoiceId, provider, ...extra }),
      },
    });
  }

  /**
   * Зачислить депозит по факту оплаты инвойса (идемпотентно).
   * Сумма берётся из PENDING-транзакции (₽), а не из вебхука.
   */
  async completeDepositByInvoice(userId: string, invoiceId: string) {
    return this.redis.withLock(`wallet:${userId}`, 4000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const pendingRows = await tx.transaction.findMany({
          where: { userId, type: TxType.DEPOSIT, status: TxStatus.PENDING },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        const pending = pendingRows.find((t) => txMetaMatches(t.meta, 'invoiceId', invoiceId));
        if (!pending) return { credited: false as const };
        const amountRub = Number(pending.amount);

        const uDep = await tx.user.findUnique({ where: { id: userId } });
        const depLimit = Number((uDep as any)?.dailyDepositLimit ?? 0);
        if (depLimit > 0) {
          const since = new Date(Date.now() - 24 * 3600 * 1000);
          const agg = await tx.transaction.aggregate({
            where: { userId, type: TxType.DEPOSIT, status: TxStatus.COMPLETED, createdAt: { gt: since } },
            _sum: { amount: true },
          });
          const usedToday = Number(agg._sum.amount ?? 0);
          if (usedToday + amountRub > depLimit) {
            throw new BadRequestException(`Превышен дневной лимит пополнения (${depLimit} ₽)`);
          }
        }
        await tx.transaction.update({ where: { id: pending.id }, data: { status: TxStatus.COMPLETED } });
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amountRub }, withdrawable: { increment: amountRub } } as any,
        });
        return { credited: true as const, amountRub };
      });
    }).then((r) => {
      if (r.credited) {
        this.audit.log(userId, 'DEPOSIT', { amount: r.amountRub, invoiceId, source: 'cryptobot' });
      }
      return r;
    });
  }

  /** Получить заявку на вывод по id. */
  async getWithdrawal(id: string) {
    return (this.prisma as any).withdrawalRequest.findUnique({ where: { id } });
  }

  /**
   * Ручная корректировка баланса администратором (выдача/списание монет).
   * amount > 0 — начислить, amount < 0 — списать.
   * Бонусов нет: withdrawable всегда равен балансу, параметр makeWithdrawable
   * оставлен для совместимости и игнорируется.
   */
  async adminAdjust(userId: string, amount: number, reason: string, makeWithdrawable = true) {
    if (!amount || amount === 0) throw new BadRequestException('Сумма не может быть нулевой');
    return this.redis.withLock(`wallet:${userId}`, 4000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('Пользователь не найден');
        const newBalance = Number(u.balance) + amount;
        if (newBalance < 0) throw new BadRequestException('Недостаточно средств для списания');

        const data: any = { balance: { increment: amount } };
        if (makeWithdrawable || amount < 0) {
          data.withdrawable = amount > 0 ? { increment: amount } : newBalance;
        } else {
          data.withdrawable = Number((u as any).withdrawable ?? u.balance);
        }

        const updated = await tx.user.update({ where: { id: userId }, data });
        await tx.transaction.create({
          data: {
            userId,
            type: amount > 0 ? TxType.DEPOSIT : TxType.WITHDRAW,
            amount: Math.abs(amount),
            status: TxStatus.COMPLETED,
            meta: JSON.stringify({ source: 'admin', reason: reason || 'admin adjust' }),
          },
        });
        return {
          balance: Number(updated.balance),
          withdrawable: Number((updated as any).withdrawable ?? 0),
        };
      });
    });
  }

  /**
   * Завершить заявку на вывод: PAID (выплачено) или REJECTED (возврат средств).
   * При отклонении удержанные деньги возвращаются на баланс.
   */
  async resolveWithdrawal(id: string, status: 'PAID' | 'REJECTED', note?: string) {
    return this.redis.withLock(`withdrawal:${id}`, 8000, async () => {
      return this.prisma.$transaction(async (tx) => {
        const wr = await (tx as any).withdrawalRequest.findUnique({ where: { id } });
        if (!wr) throw new NotFoundException('Заявка не найдена');
        if (wr.status === 'PAID' || wr.status === 'REJECTED') {
          return wr;
        }

        const updated = await (tx as any).withdrawalRequest.updateMany({
          where: { id, status: 'PENDING' },
          data:
            status === 'PAID'
              ? { status: 'PAID', processedAt: new Date() }
              : { status: 'REJECTED', note: note ?? null, processedAt: new Date() },
        });
        if (updated.count !== 1) {
          const current = await (tx as any).withdrawalRequest.findUnique({ where: { id } });
          return current ?? wr;
        }

        const withdrawTxs = await tx.transaction.findMany({
          where: { userId: wr.userId, type: TxType.WITHDRAW, status: TxStatus.PENDING },
        });
        const txIds = withdrawTxs.filter((t) => txMetaMatches(t.meta, 'withdrawalId', id)).map((t) => t.id);

        if (status === 'PAID') {
          if (txIds.length) {
            await tx.transaction.updateMany({
              where: { id: { in: txIds } },
              data: { status: TxStatus.COMPLETED },
            });
          }
        } else {
          await tx.user.update({
            where: { id: wr.userId },
            data: { balance: { increment: wr.amount }, withdrawable: { increment: wr.amount } } as any,
          });
          if (txIds.length) {
            await tx.transaction.updateMany({
              where: { id: { in: txIds } },
              data: { status: TxStatus.FAILED },
            });
          }
        }
        return { ...wr, status };
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
    return this.redis.withLock(`wallet:${ordered[0]}`, 8000, async () => {
      return this.redis.withLock(`wallet:${ordered[1]}`, 8000, async () => {
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
    return this.redis.withLock(`wallet:${ordered[0]}`, 8000, async () => {
      return this.redis.withLock(`wallet:${ordered[1]}`, 8000, async () => {
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
            await tx.user.update({
              where: { id: p1Id },
              data: { balance: { increment: wagerAmount }, withdrawable: { increment: wagerAmount }, draws: { increment: 1 }, winStreak: 0 } as any,
            });
            await tx.user.update({
              where: { id: p2Id },
              data: { balance: { increment: wagerAmount }, withdrawable: { increment: wagerAmount }, draws: { increment: 1 }, winStreak: 0 } as any,
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
          const rake = roundRub(pool * (rakePercent / 100));
          const winnerPayout = roundRub(pool - rake);
          const loserId = winnerId === p1Id ? p2Id : p1Id;

          const updatedWinner = await tx.user.update({
            where: { id: winnerId },
            data: {
              balance: { increment: winnerPayout },
              withdrawable: { increment: winnerPayout },
              wins: { increment: 1 },
              totalWon: { increment: winnerPayout },
              winStreak: { increment: 1 },
            } as any,
          });
          // Рекорд серии побед (для титулов/ретеншна).
          const ws = Number((updatedWinner as any).winStreak ?? 0);
          const best = Number((updatedWinner as any).bestWinStreak ?? 0);
          if (ws > best) {
            await tx.user.update({ where: { id: winnerId }, data: { bestWinStreak: ws } as any });
          }
          // Поражение обнуляет серию побед.
          await tx.user.update({
            where: { id: loserId },
            data: { losses: { increment: 1 }, winStreak: 0 } as any,
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
