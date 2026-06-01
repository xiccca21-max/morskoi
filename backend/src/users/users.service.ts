import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchStatus } from '../common/enums';

export interface NotifyPrefsDto {
  notifyMatchFound?: boolean;
  notifyPayout?: boolean;
  notifyRematch?: boolean;
  notifyReferral?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } }) as any;
    if (!u) throw new NotFoundException('User not found');
    return {
      id: u.id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      nickname: u.nickname ?? null,
      avatar: u.avatar,
      balance: Number(u.balance),
      withdrawable: Number(u.balance),
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      totalWagered: Number(u.totalWagered),
      totalWon: Number(u.totalWon),
      referralCount: u.referralCount ?? 0,
      loginStreak: u.loginStreak ?? 0,
      winStreak: u.winStreak ?? 0,
      bestWinStreak: u.bestWinStreak ?? 0,
      equippedTitle: u.equippedTitle ?? 'captain',
      equippedFrame: u.equippedFrame ?? 'none',
      equippedSkin: u.equippedSkin ?? 'classic',
      agreedToTerms: !!u.agreedToTermsAt,
      notifyMatchFound: u.notifyMatchFound !== false,
      notifyPayout: u.notifyPayout !== false,
      notifyRematch: u.notifyRematch !== false,
      notifyReferral: u.notifyReferral !== false,
      dailyDepositLimit: u.dailyDepositLimit ?? 0,
      selfExcludedUntil: u.selfExcludedUntil ?? null,
      createdAt: u.createdAt,
    };
  }

  async setNotifyPrefs(userId: string, prefs: NotifyPrefsDto) {
    const data: Record<string, boolean> = {};
    if (prefs.notifyMatchFound != null) data.notifyMatchFound = prefs.notifyMatchFound;
    if (prefs.notifyPayout != null) data.notifyPayout = prefs.notifyPayout;
    if (prefs.notifyRematch != null) data.notifyRematch = prefs.notifyRematch;
    if (prefs.notifyReferral != null) data.notifyReferral = prefs.notifyReferral;
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to update');
    await this.prisma.user.update({ where: { id: userId }, data: data as any });
    return this.getMe(userId);
  }

  /** Лимиты ответственной игры / самоисключение. */
  async setLimits(userId: string, dailyDepositLimit?: number, selfExcludeDays?: number) {
    const data: any = {};
    if (dailyDepositLimit != null) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } }) as any;
      const current = Number(u?.dailyDepositLimit ?? 0);
      const maxCap = Number(process.env.MAX_USER_DEPOSIT_LIMIT ?? 50000);
      const next = dailyDepositLimit > 0 ? Math.round(dailyDepositLimit) : null;
      if (next != null) {
        if (next > maxCap) {
          throw new BadRequestException(`Максимальный лимит — ${maxCap} ₽/день`);
        }
        // Пользователь может только уменьшить лимит или снять его (0), но не повысить.
        if (current > 0 && next > current) {
          throw new BadRequestException('Можно только уменьшить лимит пополнения');
        }
      }
      data.dailyDepositLimit = next;
    }
    if (selfExcludeDays != null && selfExcludeDays > 0) {
      data.selfExcludedUntil = new Date(Date.now() + selfExcludeDays * 24 * 3600 * 1000);
    }
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getMe(userId);
  }

  /**
   * Удаление аккаунта. Запрещено при ненулевом балансе (нужно сначала вывести)
   * и при активном матче. Анонимизируем PII и помечаем как удалённый.
   */
  async deleteAccount(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    if (Number(u.balance) > 0) {
      throw new BadRequestException('Сначала выведите остаток баланса');
    }
    const active = await this.prisma.match.findFirst({
      where: {
        status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] },
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
    });
    if (active) throw new BadRequestException('Завершите активный бой перед удалением');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: null,
        firstName: 'Удалённый',
        lastName: null,
        avatar: null,
        banned: true,
        telegramId: `deleted_${userId}`,
      } as any,
    });
    return { ok: true };
  }

  async getById(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return {
      id: u.id,
      username: (u as any).nickname ?? u.username ?? u.firstName ?? `Player-${u.id.slice(0, 4)}`,
      avatar: u.avatar,
      wins: u.wins,
      losses: u.losses,
    };
  }
}
