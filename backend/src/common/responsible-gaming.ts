import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ответственная игра: блокирует денежные действия и вход в бой для
 * самоисключённых аккаунтов. Проверка нужна не только на логине — у игрока
 * может быть живой JWT, поэтому страхуем все денежные/игровые точки входа.
 *
 * Бросает:
 *  - ForbiddenException, если аккаунт забанен;
 *  - BadRequestException, если активно самоисключение (до даты).
 */
export async function assertCanPlay(prisma: PrismaService, userId: string): Promise<void> {
  const u = (await prisma.user.findUnique({
    where: { id: userId },
  })) as { banned?: boolean; selfExcludedUntil?: Date | null } | null;
  if (!u) return; // отсутствие юзера обработают вызывающие проверки

  if (u.banned) throw new ForbiddenException('Аккаунт заблокирован');

  const until = u.selfExcludedUntil ? new Date(u.selfExcludedUntil) : null;
  if (until && until.getTime() > Date.now()) {
    const date = until.toLocaleString('ru-RU');
    throw new BadRequestException(`Самоисключение активно до ${date}. Игра и пополнение недоступны.`);
  }
}
