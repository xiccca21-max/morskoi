import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Простая защита админских эндпоинтов по статичному ключу из ADMIN_API_KEY.
 * Заголовок: x-admin-key. Если ключ не задан в env — доступ запрещён.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) throw new UnauthorizedException('Admin API disabled');
    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers['x-admin-key'];
    if (provided !== expected) throw new UnauthorizedException('Bad admin key');
    return true;
  }
}
