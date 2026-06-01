import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  COSMETICS,
  CosmeticStats,
  CosmeticType,
  DEFAULT_EQUIP,
  isUnlocked,
} from './cosmetics.catalog';

@Injectable()
export class CosmeticsService {
  constructor(private readonly prisma: PrismaService) {}

  private statsOf(u: any): CosmeticStats {
    return {
      referrals: Number(u.referralCount ?? 0),
      bestWinStreak: Number(u.bestWinStreak ?? 0),
      wins: Number(u.wins ?? 0),
    };
  }

  async getProfile(userId: string) {
    const u = (await this.prisma.user.findUnique({ where: { id: userId } })) as any;
    if (!u) throw new NotFoundException('User not found');
    const stats = this.statsOf(u);
    const items = COSMETICS.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      desc: c.desc,
      unlocked: isUnlocked(c, stats),
    }));
    return {
      stats,
      equipped: {
        title: u.equippedTitle ?? DEFAULT_EQUIP.title,
        frame: u.equippedFrame ?? DEFAULT_EQUIP.frame,
        skin: u.equippedSkin ?? DEFAULT_EQUIP.skin,
      },
      items,
    };
  }

  async equip(userId: string, type: CosmeticType, id: string) {
    const item = COSMETICS.find((c) => c.id === id && c.type === type);
    if (!item) throw new BadRequestException('Неизвестный предмет');

    const u = (await this.prisma.user.findUnique({ where: { id: userId } })) as any;
    if (!u) throw new NotFoundException('User not found');
    if (!isUnlocked(item, this.statsOf(u))) {
      throw new BadRequestException('Предмет ещё не разблокирован');
    }

    const field =
      type === 'title' ? 'equippedTitle' : type === 'frame' ? 'equippedFrame' : 'equippedSkin';
    if (type === 'badge') throw new BadRequestException('Бейджи нельзя экипировать');

    await this.prisma.user.update({ where: { id: userId }, data: { [field]: id } as any });
    return this.getProfile(userId);
  }
}
