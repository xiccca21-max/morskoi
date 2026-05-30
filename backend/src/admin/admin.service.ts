import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  private publicUser(u: any) {
    return {
      id: u.id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      nickname: u.nickname ?? null,
      balance: Number(u.balance),
      withdrawable: Number(u.withdrawable ?? 0),
      wins: u.wins,
      losses: u.losses,
      banned: u.banned,
      referralCount: u.referralCount ?? 0,
      createdAt: u.createdAt,
    };
  }

  /** Поиск пользователей по id / telegramId / username / nickname / имени. */
  async listUsers(q?: string) {
    const where = q
      ? {
          OR: [
            { id: { contains: q } },
            { telegramId: { contains: q } },
            { username: { contains: q } },
            { nickname: { contains: q } },
            { firstName: { contains: q } },
          ],
        }
      : {};
    const users = await this.prisma.user.findMany({
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return users.map((u) => this.publicUser(u));
  }

  async getUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Пользователь не найден');
    const [transactions, withdrawals] = await Promise.all([
      this.prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      (this.prisma as any).withdrawalRequest.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      user: this.publicUser(u),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        createdAt: t.createdAt,
        meta: t.meta,
      })),
      withdrawals,
    };
  }

  async credit(id: string, amount: number, reason: string, makeWithdrawable: boolean) {
    return this.wallet.adminAdjust(id, amount, reason, makeWithdrawable);
  }

  async setBan(id: string, banned: boolean) {
    const u = await this.prisma.user.update({ where: { id }, data: { banned } });
    return this.publicUser(u);
  }

  /** Заявки на вывод всех пользователей (по статусу). */
  async listWithdrawals(status?: string) {
    const where = status ? { status } : {};
    const list = await (this.prisma as any).withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: true },
    });
    return list.map((w: any) => ({
      id: w.id,
      amount: Number(w.amount),
      fee: Number(w.fee),
      net: Number(w.net),
      method: w.method,
      destination: w.destination,
      status: w.status,
      note: w.note,
      createdAt: w.createdAt,
      processedAt: w.processedAt,
      user: w.user ? this.publicUser(w.user) : null,
    }));
  }

  async stats() {
    const [users, banned, pending, agg] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { banned: true } }),
      (this.prisma as any).withdrawalRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.user.aggregate({ _sum: { balance: true } }),
    ]);
    return {
      users,
      banned,
      pendingWithdrawals: pending,
      totalBalance: Number(agg._sum.balance ?? 0),
    };
  }
}
