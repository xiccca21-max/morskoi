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
  if (!process.env.REDIS_URL?.trim()) {
    fatal.push('REDIS_URL не задан — wallet locks не будут работать между инстансами');
  }
  const polling = process.env.TELEGRAM_BOT_POLLING === 'true';
  if (!polling && !process.env.TELEGRAM_WEBHOOK_URL?.trim()) {
    fatal.push('TELEGRAM_WEBHOOK_URL обязателен при TELEGRAM_BOT_POLLING=false');
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

  // Security-заголовки. CSP/COEP/CORP и frameguard выключены: Telegram Mini App
  // открывается во WebView/iframe telegram.org — X-Frame-Options: SAMEORIGIN ломает загрузку.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: false,
    }),
  );

  // Ответы API не должны кэшироваться: Telegram WebView/браузер кэшируют GET
  // (список боёв, баланс) и показывают «протухшие» лобби — join падает с
  // «бой уже принят или закрыт». Жёстко запрещаем кэш для всех /api.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

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
    // Vite ставит crossorigin на <script type="module"> — без ACAO WebView Telegram
    // молча не выполняет JS (HTML грузится, «Загрузка» висит вечно).
    const assetCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // КРИТИЧНО: этот middleware смонтирован на '/' и иначе вешает 7-дневный кэш
      // на ответы /api (список боёв «протухает», join падает). Пропускаем API/сокеты.
      if (req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io') || req.path === '/health') {
        return next();
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // CDN не должен пересжимать/резать тело (иначе Content-Length ≠ фактический размер).
      res.setHeader('Cache-Control', 'public, max-age=604800, no-transform');
      next();
    };
    const assetsDir = join(frontendDist, 'assets');
    app.use(
      '/assets',
      assetCors,
      express.static(assetsDir, {
        maxAge: '7d',
        immutable: false,
        fallthrough: false,
        index: false,
        setHeaders(res) {
          res.setHeader('Cache-Control', 'public, max-age=604800, no-transform');
        },
      }),
    );
    app.use(assetCors, express.static(join(frontendDist, 'public')));
    app.use((req, res, next) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io') ||
        req.path === '/health'
      ) {
        return next();
      }
      // Не отдаём index.html на /assets/*.js — иначе WebView получает text/html вместо JS
      // (кэш старого HTML + новый деплой = вечная «Загрузка»).
      if (req.path.startsWith('/assets/')) {
        return res.status(404).type('text/plain').send('Not found');
      }
      if (req.path === '/admin.html' && process.env.NODE_ENV === 'production') {
        const allowIps = (process.env.ADMIN_PANEL_IPS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
        if (!allowIps.length || !allowIps.includes(ip)) {
          return res.status(404).type('text/plain').send('Not found');
        }
      }
      const staticFile = join(frontendDist, req.path);
      if (req.path.includes('.') && existsSync(staticFile)) {
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
