import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export interface DailyBonusResult {
  claimed: boolean;
  amount?: number;
  streak?: number;
  nextAmount?: number;
}

/** Ежедневный бонус за вход: стрик до 7 дней, сумма растёт. Бонус невыводимый. */
@Injectable()
export class DailyBonusService {
  private readonly base = Number(process.env.DAILY_BONUS_BASE ?? 10);
  private readonly step = Number(process.env.DAILY_BONUS_STEP ?? 5);
  private readonly maxStreak = Number(process.env.DAILY_BONUS_MAX_STREAK ?? 7);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /** Сумма бонуса для заданного стрика (1 = первый день). */
  bonusForStreak(streak: number): number {
    const s = Math.min(Math.max(streak, 1), this.maxStreak);
    return this.base + (s - 1) * this.step;
  }

  /** Попытка начислить ежедневный бонус. Один раз в календарные сутки (UTC). */
  async tryClaim(userId: string): Promise<DailyBonusResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } }) as any;
    if (!user) return { claimed: false };

    const now = new Date();
    const today = this.dayKey(now);
    const last = user.lastDailyClaimAt ? this.dayKey(new Date(user.lastDailyClaimAt)) : null;

    if (last === today) {
      const streak = user.loginStreak ?? 0;
      return { claimed: false, streak, nextAmount: this.bonusForStreak(streak) };
    }

    let streak = 1;
    if (last) {
      const yesterday = this.dayKey(new Date(now.getTime() - 86_400_000));
      streak = last === yesterday ? Math.min((user.loginStreak ?? 0) + 1, this.maxStreak) : 1;
    }

    const amount = this.bonusForStreak(streak);
    await this.wallet.deposit(userId, amount, { source: 'daily_login', streak }, false);
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastDailyClaimAt: now, loginStreak: streak } as any,
    });

    return {
      claimed: true,
      amount,
      streak,
      nextAmount: this.bonusForStreak(Math.min(streak + 1, this.maxStreak)),
    };
  }

  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
