import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AuditService } from '../common/audit.service';
import { PresenceService } from '../common/presence.service';
import { parseTxMeta } from '../common/transaction-meta';
import { MatchStatus } from '../common/enums';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly presence: PresenceService,
  ) {}

  private userLabel(u: {
    nickname?: string | null;
    firstName?: string | null;
    username?: string | null;
    telegramId?: string;
    id?: string;
  }) {
    return (
      u.nickname ||
      u.firstName ||
      (u.username ? `@${u.username}` : null) ||
      u.telegramId ||
      u.id ||
      '—'
    );
  }

  private publicUser(u: any) {
    return {
      id: u.id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      nickname: u.nickname ?? null,
      label: this.userLabel(u),
      balance: Number(u.balance),
      withdrawable: Number(u.withdrawable ?? u.balance),
      wins: u.wins,
      losses: u.losses,
      banned: u.banned,
      referralCount: u.referralCount ?? 0,
      createdAt: u.createdAt,
    };
  }

  private userBrief(u?: {
    id: string;
    telegramId: string;
    username?: string | null;
    firstName?: string | null;
    nickname?: string | null;
  } | null) {
    if (!u) return null;
    return {
      id: u.id,
      telegramId: u.telegramId,
      username: u.username,
      label: this.userLabel(u),
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
    const r = await this.wallet.adminAdjust(id, amount, reason, makeWithdrawable);
    this.audit.log(id, amount > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT', { amount, reason, makeWithdrawable });
    return r;
  }

  async setBan(id: string, banned: boolean) {
    const u = await this.prisma.user.update({ where: { id }, data: { banned } });
    this.audit.log(id, banned ? 'ADMIN_BAN' : 'ADMIN_UNBAN', {});
    return this.publicUser(u);
  }

  async logBroadcast(text: string, result: { total: number; sent: number; failed: number }) {
    this.audit.log(null, 'ADMIN_BROADCAST', {
      preview: text.slice(0, 120),
      ...result,
    });
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
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const [users, banned, pending, agg, onlineIds, activeMatches, inQueue, openLobbies, logs24h] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { banned: true } }),
        (this.prisma as any).withdrawalRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.user.aggregate({ _sum: { balance: true } }),
        this.presence.listOnlineUserIds(),
        this.prisma.match.count({
          where: { status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] } },
        }),
        this.prisma.matchmakingQueue.count(),
        this.prisma.lobby.count({ where: { status: 'OPEN' } }),
        (this.prisma as any).actionLog.findMany({
          where: { createdAt: { gte: since24h } },
          select: { action: true },
        }),
      ]);

    const dayCounts: Record<string, number> = {};
    for (const row of logs24h as { action: string }[]) {
      dayCounts[row.action] = (dayCounts[row.action] ?? 0) + 1;
    }

    return {
      users,
      banned,
      pendingWithdrawals: pending,
      totalBalance: Number(agg._sum.balance ?? 0),
      onlineNow: onlineIds.length,
      activeMatches,
      inQueue,
      openLobbies,
      last24h: {
        logins: dayCounts.LOGIN ?? 0,
        registrations: dayCounts.REGISTER ?? 0,
        deposits: dayCounts.DEPOSIT ?? 0,
        matchesStarted: dayCounts.MATCH_STARTED ?? 0,
        matchesFinished: dayCounts.MATCH_FINISHED ?? 0,
      },
    };
  }

  /** Живая картина: кто онлайн, в бою, в очереди + последние события. */
  async getLiveActivity() {
    const onlineIds = await this.presence.listOnlineUserIds();
    const userSelect = {
      id: true,
      telegramId: true,
      username: true,
      firstName: true,
      nickname: true,
      balance: true,
    } as const;

    const [onlineUsers, activeMatches, queue, lobbies, recentEvents] = await Promise.all([
      onlineIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: onlineIds } },
            select: userSelect as any,
          })
        : Promise.resolve([]),
      this.prisma.match.findMany({
        where: { status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] } },
        include: {
          player1: { select: userSelect },
          player2: { select: userSelect },
          gameState: { select: { gameStatus: true, currentTurn: true } },
        } as any,
        orderBy: { startedAt: 'desc' },
        take: 40,
      }),
      this.prisma.matchmakingQueue.findMany({
        include: {
          user: { select: userSelect },
        } as any,
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.lobby.findMany({
        where: { status: 'OPEN' },
        include: {
          host: { select: userSelect },
        } as any,
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.listActionLogs(60),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      online: {
        count: onlineUsers.length,
        users: onlineUsers.map((u: any) => ({
          ...this.userBrief(u),
          balance: Number(u.balance),
        })),
      },
      matches: {
        count: activeMatches.length,
        items: (activeMatches as any[]).map((m) => ({
          matchId: m.id,
          status: m.status,
          gameStatus: m.gameState?.gameStatus ?? null,
          wagerAmount: Number(m.wagerAmount),
          isTraining: !!m.isTraining,
          startedAt: m.startedAt,
          player1: this.userBrief(m.player1),
          player2: this.userBrief(m.player2),
          currentTurn: m.gameState?.currentTurn
            ? this.userBrief(
                m.gameState.currentTurn === m.player1Id ? m.player1 : m.player2,
              )
            : null,
        })),
      },
      queue: {
        count: queue.length,
        items: (queue as any[]).map((q) => ({
          user: this.userBrief(q.user),
          wagerAmount: Number(q.wagerAmount),
          since: q.createdAt,
        })),
      },
      lobbies: {
        count: lobbies.length,
        items: (lobbies as any[]).map((l) => ({
          code: l.code,
          wagerAmount: Number(l.wagerAmount),
          isTraining: !!l.isTraining,
          isPublic: !!l.isPublic,
          expiresAt: l.expiresAt,
          host: this.userBrief(l.host),
        })),
      },
      recentEvents,
    };
  }

  async listActionLogs(limit = 50, action?: string) {
    const where = action ? { action } : {};
    const logs = await (this.prisma as any).actionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const userIds = [...new Set(logs.map((l: any) => l.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, telegramId: true, username: true, firstName: true, nickname: true } as any,
        })
      : [];
    const userMap = new Map((users as any[]).map((u) => [u.id, u]));

    return logs.map((l: any) => ({
      id: l.id,
      userId: l.userId,
      user: l.userId ? this.userBrief(userMap.get(l.userId) ?? null) : null,
      action: l.action,
      meta: parseTxMeta(l.meta),
      createdAt: l.createdAt,
    }));
  }
}
