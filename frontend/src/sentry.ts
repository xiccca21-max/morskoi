import * as Sentry from '@sentry/react';

/**
 * Инициализация Sentry на фронте. No-op, если VITE_SENTRY_DSN не задан,
 * поэтому в dev ничего не отправляется и настройка не требуется.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const sentryEnabled = !!dsn;

/** Маскирует JWT/токены в произвольной строке перед отправкой в Sentry. */
function scrub(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [filtered]')
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, '[jwt]')
    .replace(/([?&](?:token|access_token|tgWebAppData|hash|auth)=)[^&\s]+/gi, '$1[filtered]');
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Не отправляем заголовки/куки и чистим токены из URL и сообщений.
      if (event.request) {
        delete (event.request as any).headers;
        delete (event.request as any).cookies;
        if (event.request.url) event.request.url = scrub(event.request.url);
        if (typeof event.request.query_string === 'string') {
          event.request.query_string = scrub(event.request.query_string);
        }
      }
      if (event.message) event.message = scrub(event.message);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = scrub(ex.value);
      }
      return event;
    },
  });
}

export { Sentry };
