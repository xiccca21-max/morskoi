import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Простая защита админских эндпоинтов по статичному ключу из ADMIN_API_KEY.
 * Заголовок: x-admin-key. Если ключ не задан в env — доступ запрещён.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = (process.env.ADMIN_API_KEY ?? '').trim();
    if (!expected) throw new UnauthorizedException('Admin API disabled — задай ADMIN_API_KEY в .env на сервере');
    const req = ctx.switchToHttp().getRequest();
    const provided = String(req.headers['x-admin-key'] ?? '').trim();
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException(
        'Bad admin key — скопируй ADMIN_API_KEY из .env на сервере (без пробелов и кавычек)',
      );
    }
    return true;
  }
}
