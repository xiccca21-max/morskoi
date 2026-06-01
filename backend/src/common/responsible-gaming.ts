import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PlayUser = {
  banned?: boolean;
  selfExcludedUntil?: Date | null;
  agreedToTermsAt?: Date | null;
};

/**
 * Ответственная игра: блокирует денежные действия и вход в бой для
 * самоисключённых / не принявших правила аккаунтов.
 */
export async function assertCanPlay(prisma: PrismaService, userId: string): Promise<void> {
  const u = (await prisma.user.findUnique({
    where: { id: userId },
  })) as PlayUser | null;
  if (!u) throw new NotFoundException('User not found');

  if (u.banned) throw new ForbiddenException('Аккаунт заблокирован');

  const until = u.selfExcludedUntil ? new Date(u.selfExcludedUntil) : null;
  if (until && until.getTime() > Date.now()) {
    const date = until.toLocaleString('ru-RU');
    throw new BadRequestException(`Самоисключение активно до ${date}. Игра и пополнение недоступны.`);
  }

  if (!u.agreedToTermsAt) {
    throw new BadRequestException('Примите правила игры в настройках');
  }
}
