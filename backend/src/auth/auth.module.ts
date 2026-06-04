import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { DailyBonusService } from './daily-bonus.service';

/**
 * Секрет JWT обязателен во всех окружениях, кроме тестов. Раньше был тихий
 * fallback 'change_me' — при случайном деплое с NODE_ENV ≠ production это
 * позволяло подделывать токены. Теперь приложение не поднимется без секрета.
 */
function resolveJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
  if (isTest) return 'test_only_secret_not_for_production';
  throw new Error(
    'JWT_SECRET не задан или короче 16 символов. Сгенерируй: openssl rand -hex 32',
  );
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, DailyBonusService],
  exports: [AuthService, JwtAuthGuard, JwtModule, DailyBonusService],
})
export class AuthModule {}
