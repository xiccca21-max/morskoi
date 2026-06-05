import { Body, Controller, Post, Res, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import {
  clearPanelSessionCookie,
  credentialsConfigured,
  setPanelSessionCookie,
  verifyPanelCredentials,
} from './admin-panel-session';

class PanelLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

/** Вход в веб-админку (логин/пароль → httpOnly cookie). Не путать с x-admin-key API. */
@Controller('admin')
export class AdminPanelController {
  @Post('panel-login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() dto: PanelLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!credentialsConfigured()) {
      throw new ServiceUnavailableException('Панель не настроена (ADMIN_PANEL_USER/PASSWORD)');
    }
    if (!verifyPanelCredentials(dto.username.trim(), dto.password)) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    setPanelSessionCookie(res, dto.username.trim());
    return { ok: true };
  }

  @Post('panel-logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearPanelSessionCookie(res);
    return { ok: true };
  }
}
