import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchStatus } from '../common/enums';

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
      withdrawable: Number(u.withdrawable ?? 0),
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      totalWagered: Number(u.totalWagered),
      totalWon: Number(u.totalWon),
      referralCount: u.referralCount ?? 0,
      agreedToTerms: !!u.agreedToTermsAt,
      dailyDepositLimit: u.dailyDepositLimit ?? 0,
      selfExcludedUntil: u.selfExcludedUntil ?? null,
      createdAt: u.createdAt,
    };
  }

  /** Лимиты ответственной игры / самоисключение. */
  async setLimits(userId: string, dailyDepositLimit?: number, selfExcludeDays?: number) {
    const data: any = {};
    if (dailyDepositLimit != null) data.dailyDepositLimit = dailyDepositLimit > 0 ? dailyDepositLimit : null;
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
      username: u.username ?? u.firstName ?? `Player-${u.id.slice(0, 4)}`,
      avatar: u.avatar,
      wins: u.wins,
      losses: u.losses,
    };
  }
}
