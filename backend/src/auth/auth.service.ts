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

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        username:  tg.username ?? undefined,
        firstName: tg.first_name ?? undefined,
        lastName:  tg.last_name ?? undefined,
        avatar:    tg.photo_url ?? undefined,
      },
      create: {
        telegramId,
        username:  tg.username,
        firstName: tg.first_name,
        lastName:  tg.last_name,
        avatar:    tg.photo_url,
        // Демо-баланс для новых пользователей. В проде убрать или поставить 0.
        balance:   100,
      },
    });

    if (user.banned) throw new UnauthorizedException('User banned');

    const token = await this.jwt.signAsync({
      sub: user.id,
      tgId: user.telegramId,
      username: user.username ?? undefined,
    } as JwtPayload);

    return {
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        balance: Number(user.balance),
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
      },
      startParam: parsed.startParam,
    };
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

    return {
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        balance: Number(user.balance),
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
      },
    };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
