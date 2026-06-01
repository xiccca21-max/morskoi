import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DailyBonusResult {
  claimed: boolean;
  streak?: number;
  reward?: string; // косметический «сундук дня» (фраза/эмодзи, без денег)
}

/** Косметические «сундуки» за ежедневный вход — без денег, только настроение. */
const DAILY_CHESTS = [
  '🧭 Попутного ветра, капитан!',
  '⚓ Сундук дня: морская удача на борту',
  '🦜 Боцман передаёт привет',
  '🌊 Семь футов под килём',
  '🏴‍☠️ Чёрная метка твоим врагам',
  '🔱 Нептун благоволит',
  '🗺️ Карта сокровищ обновлена',
];

/** Серия входов подряд — только статистика и достижения, без денег. */
@Injectable()
export class DailyBonusService {
  private readonly maxStreak = Number(process.env.DAILY_BONUS_MAX_STREAK ?? 7);

  constructor(private readonly prisma: PrismaService) {}

  async tryClaim(userId: string): Promise<DailyBonusResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } }) as any;
    if (!user) return { claimed: false };

    const now = new Date();
    const today = this.dayKey(now);
    const last = user.lastDailyClaimAt ? this.dayKey(new Date(user.lastDailyClaimAt)) : null;

    if (last === today) {
      return { claimed: false, streak: user.loginStreak ?? 0 };
    }

    let streak = 1;
    if (last) {
      const yesterday = this.dayKey(new Date(now.getTime() - 86_400_000));
      streak = last === yesterday ? Math.min((user.loginStreak ?? 0) + 1, this.maxStreak) : 1;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastDailyClaimAt: now, loginStreak: streak, lastChestAt: now } as any,
    });

    // Сундук дня — детерминированно по дате, чтобы у всех был «сегодняшний».
    const idx = Number(today.replace(/-/g, '')) % DAILY_CHESTS.length;
    return { claimed: true, streak, reward: DAILY_CHESTS[idx] };
  }

  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
