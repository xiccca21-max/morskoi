import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });

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
