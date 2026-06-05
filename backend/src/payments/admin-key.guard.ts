import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/** Читает ключ из заголовка (plain или base64 для Unicode). */
export function readProvidedAdminKey(headers: Record<string, unknown>): string {
  const enc = String(headers['x-admin-key-encoding'] ?? '').toLowerCase();
  const raw = String(headers['x-admin-key'] ?? '').trim();
  if (!raw) return '';
  if (enc === 'base64') {
    try {
      return Buffer.from(raw, 'base64').toString('utf8').trim();
    } catch {
      return '';
    }
  }
  return raw;
}

/**
 * Простая защита админских эндпоинтов по статичному ключу из ADMIN_API_KEY.
 * Заголовок: x-admin-key (+ x-admin-key-encoding: base64 при необходимости).
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = (process.env.ADMIN_API_KEY ?? '').trim();
    if (!expected) throw new UnauthorizedException('Admin API disabled — задай ADMIN_API_KEY в .env на сервере');
    const req = ctx.switchToHttp().getRequest();
    const provided = readProvidedAdminKey(req.headers ?? {});
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
