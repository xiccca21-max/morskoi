import * as Sentry from '@sentry/react';

/**
 * Инициализация Sentry на фронте. No-op, если VITE_SENTRY_DSN не задан,
 * поэтому в dev ничего не отправляется и настройка не требуется.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const sentryEnabled = !!dsn;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

export { Sentry };
