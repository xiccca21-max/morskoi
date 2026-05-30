import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { validateAndParseInitData } from './telegram-init-data';

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
        // Демо-бонус новым: только баланс, withdrawable=0 (вывести нельзя).
        balance:   100,
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
          await this.prisma.user.update({
            where: { id: user.id },
            data: { referredById: refId } as any,
          });
          await this.prisma.user.update({
            where: { id: refId },
            data: { referralCount: { increment: 1 }, balance: { increment: bonus } } as any,
          });
          await this.prisma.transaction.create({
            data: { userId: refId, type: 'DEPOSIT', amount: bonus, status: 'COMPLETED', meta: JSON.stringify({ source: 'referral', invited: user.id }) },
          });
        }
      }
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      tgId: user.telegramId,
      username: user.username ?? undefined,
    } as JwtPayload);

    return {
      token,
      user: this.publicUser(user),
      startParam: parsed.startParam,
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
      agreedToTerms: !!user.agreedToTermsAt,
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

  /**
   * DEV-only логин без Telegram. Создаёт/обновляет фейкового пользователя по nickname.
   * Активен только когда NODE_ENV !== 'production' и DEV_AUTH_ENABLED=true.
   * Используется для локального тестирования PvP в двух вкладках браузера.
   */
  async loginDev(nickname: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const enabled = process.env.DEV_AUTH_ENABLED === 'true';
    if (isProd || !enabled) {
      throw new UnauthorizedException('Dev auth disabled');
    }

    const clean = (nickname || '').trim().toLowerCase().replace(/[^a-zа-яё0-9_]/gi, '').slice(0, 24);
    if (!clean) throw new UnauthorizedException('nickname required');

    const telegramId = `dev_${clean}`;

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        username: clean,
        firstName: clean,
        balance: 100,
      },
    });

    const token = await this.jwt.signAsync({
      sub: user.id,
      tgId: user.telegramId,
      username: user.username ?? undefined,
    } as JwtPayload);

    return { token, user: this.publicUser(user) };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
