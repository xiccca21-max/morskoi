import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { validateAndParseInitData } from './telegram-init-data';
import { DailyBonusService } from './daily-bonus.service';

export interface JwtPayload {
  sub: string;       // userId
  tgId: string;
  username?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly dailyBonus: DailyBonusService,
    private readonly bot: TelegramBotService,
  ) {}

  async loginWithTelegram(initData: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new UnauthorizedException('Bot token not configured');

    let parsed;
    try {
      parsed = validateAndParseInitData(initData, botToken);
    } catch (e: any) {
      throw new UnauthorizedException(`initData invalid: ${e.message}`);
    }

    const tg = parsed.user;
    const telegramId = String(tg.id);

    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    const isNew = !existing;

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        username:  tg.username ?? undefined,
        firstName: tg.first_name ?? undefined,
        lastName:  tg.last_name ?? undefined,
        avatar:    tg.photo_url ?? undefined,
        language:  tg.language_code ?? undefined,
      } as any,
      create: {
        telegramId,
        username:  tg.username,
        firstName: tg.first_name,
        lastName:  tg.last_name,
        avatar:    tg.photo_url,
        language:  tg.language_code,
        balance:   0,
        withdrawable: 0,
      } as any,
    });

    if (user.banned) throw new UnauthorizedException('User banned');

    const excludedUntil = (user as any).selfExcludedUntil as Date | null;
    if (excludedUntil && new Date(excludedUntil) > new Date()) {
      const until = new Date(excludedUntil).toLocaleString('ru-RU');
      throw new UnauthorizedException(`Самоисключение активно до ${until}`);
    }

    // Реферал: start_param вида ref_<userId> — засчитываем при первой регистрации
    if (isNew && parsed.startParam?.startsWith('ref_')) {
      const refId = parsed.startParam.slice(4);
      if (refId && refId !== user.id) {
        const referrer = await this.prisma.user.findUnique({ where: { id: refId } });
        if (referrer) {
          const bonus = Number(process.env.REFERRAL_BONUS ?? 25);
          const inviteeBonus = Number(process.env.INVITEE_BONUS ?? 10);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { referredById: refId, balance: { increment: inviteeBonus } } as any,
          });
          await this.prisma.user.update({
            where: { id: refId },
            data: { referralCount: { increment: 1 }, balance: { increment: bonus } } as any,
          });
          await this.prisma.transaction.create({
            data: { userId: refId, type: 'DEPOSIT', amount: bonus, status: 'COMPLETED', meta: JSON.stringify({ source: 'referral', invited: user.id }) },
          });
          if (inviteeBonus > 0) {
            await this.prisma.transaction.create({
              data: { userId: user.id, type: 'DEPOSIT', amount: inviteeBonus, status: 'COMPLETED', meta: JSON.stringify({ source: 'referral_invitee', referrer: refId }) },
            });
          }
          const invName = tg.username ?? tg.first_name ?? 'Новый игрок';
          this.bot.notifyUser(
            refId,
            `🎉 <b>Реферал!</b> ${invName} зарегистрировался по твоей ссылке.\n+${bonus} ₽ на баланс.`,
            { pref: 'referral' },
          ).catch(() => undefined);
          if (inviteeBonus > 0) {
            this.bot.notifyUser(
              user.id,
              `🎁 Бонус за регистрацию по приглашению: <b>+${inviteeBonus} ₽</b>`,
              { pref: 'referral' },
            ).catch(() => undefined);
          }
        }
      }
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      tgId: user.telegramId,
      username: user.username ?? undefined,
    } as JwtPayload);

    const dailyBonus = await this.dailyBonus.tryClaim(user.id).catch(() => ({ claimed: false }));

    const fresh = dailyBonus.claimed
      ? await this.prisma.user.findUnique({ where: { id: user.id } })
      : user;

    return {
      token,
      user: this.publicUser(fresh ?? user),
      startParam: parsed.startParam,
      dailyBonus,
    };
  }

  /** Унифицированный публичный объект пользователя. */
  publicUser(user: any) {
    return {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      nickname: user.nickname ?? null,
      avatar: user.avatar,
      balance: Number(user.balance),
      withdrawable: Number(user.withdrawable ?? 0),
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      referralCount: user.referralCount ?? 0,
      loginStreak: user.loginStreak ?? 0,
      agreedToTerms: !!user.agreedToTermsAt,
      notifyMatchFound: user.notifyMatchFound !== false,
      notifyPayout: user.notifyPayout !== false,
      notifyRematch: user.notifyRematch !== false,
      notifyReferral: user.notifyReferral !== false,
      createdAt: user.createdAt,
    };
  }

  /** Принятие правил/возраста 18+. */
  async agreeToTerms(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { agreedToTermsAt: new Date() } as any,
    });
    return this.publicUser(user);
  }

  /** Установить пользовательский ник. */
  async setNickname(userId: string, nickname: string) {
    const clean = (nickname || '').trim().slice(0, 24);
    if (clean.length < 2) throw new UnauthorizedException('Ник слишком короткий');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { nickname: clean } as any,
    });
    return this.publicUser(user);
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
