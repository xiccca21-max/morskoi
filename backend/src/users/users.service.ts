import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      createdAt: u.createdAt,
    };
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
