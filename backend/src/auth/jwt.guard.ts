import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService, JwtPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('No token');
    const token = header.slice(7);
    const payload: JwtPayload = await this.auth.verifyActiveToken(token);
    const initData =
      (req.headers['x-telegram-init-data'] as string | undefined) ??
      (req.headers['X-Telegram-Init-Data'] as string | undefined);
    await this.auth.assertTelegramInitDataForUser(initData, payload);
    req.user = payload;
    return true;
  }
}
