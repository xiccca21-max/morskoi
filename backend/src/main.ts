import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Жёсткая проверка критичных секретов перед стартом в production.
 * Лучше не подняться вовсе, чем работать с дефолтным ключом (подделка токенов).
 */
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const fatal: string[] = [];
  const warn: string[] = [];

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === 'change_me' || jwt.length < 16) {
    fatal.push('JWT_SECRET не задан или слишком короткий/дефолтный (нужно ≥16 случайных символов)');
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.startsWith('123456')) {
    fatal.push('TELEGRAM_BOT_TOKEN не задан');
  }
  if (!process.env.ADMIN_API_KEY) {
    warn.push('ADMIN_API_KEY не задан — админ-API отключён');
  }
  if (!process.env.CORS_ORIGINS) {
    warn.push('CORS_ORIGINS не задан — используется localhost по умолчанию');
  }

  for (const w of warn) Logger.warn(w, 'Bootstrap');
  if (fatal.length) {
    for (const f of fatal) Logger.error(f, 'Bootstrap');
    throw new Error('Отказ запуска: не настроены критичные секреты (см. ошибки выше)');
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false, rawBody: true });

  // За nginx: доверяем первому прокси, чтобы req.ip брался из X-Forwarded-For.
  // Без этого rate-limiter и логи видят один IP nginx на всех пользователей.
  app.set('trust proxy', 1);

  // Security-заголовки. CSP и COEP выключены: ломали бы SPA, инлайн-скрипт
  // админки и загрузку из Telegram. Остальные защиты (X-Frame, noSniff и т.д.) активны.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const isDev = process.env.NODE_ENV !== 'production';
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');
  app.enableCors({
    // В dev разрешаем любой origin (localtunnel/ngrok меняют URL каждый раз)
    origin: isDev ? true : origins,
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Раздаём собранный frontend с того же порта — один origin для Telegram Mini App
  const frontendCandidates = [
    join(process.cwd(), 'frontend', 'dist'),       // Docker (/app/frontend/dist)
    join(process.cwd(), '..', 'frontend', 'dist'), // локально из backend/
  ];
  const frontendDist = frontendCandidates.find((p) => existsSync(p));
  if (frontendDist) {
    app.use('/assets', express.static(join(frontendDist, 'assets')));
    app.use((req, res, next) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io') ||
        req.path === '/health'
      ) {
        return next();
      }
      if (req.path.includes('.') && existsSync(join(frontendDist, req.path))) {
        return express.static(frontendDist)(req, res, next);
      }
      // Telegram кэширует index.html — без no-cache пользователи видят старый JS
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(join(frontendDist, 'index.html'));
    });
    Logger.log(`Serving frontend from ${frontendDist}`, 'Bootstrap');
  } else {
    Logger.warn(`Frontend dist not found`, 'Bootstrap');
  }

  // Railway/Render задают PORT; локально и Docker — BACKEND_PORT
  const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`🚢 Naval Clash backend running on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
