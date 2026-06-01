import * as Sentry from '@sentry/node';

/**
 * Инициализация Sentry. Должна импортироваться ПЕРВОЙ строкой в main.ts,
 * до загрузки остального приложения. Полностью no-op, если SENTRY_DSN не задан,
 * поэтому в dev/локально ничего не отправляется и не требует настройки.
 */
const dsn = process.env.SENTRY_DSN;
export const sentryEnabled = !!dsn;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_RELEASE || undefined,
    // Доля транзакций для трейсинга. Денежное приложение — держим низкой,
    // чтобы не раздувать квоту; ошибки шлются всегда.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

export { Sentry };
