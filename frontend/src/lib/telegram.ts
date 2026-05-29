// Утилиты для работы с Telegram WebApp SDK
declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export function getTelegramWebApp() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}

export function getInitData(): string {
  const tg = getTelegramWebApp();
  if (tg?.initData) return tg.initData as string;
  // В dev можем поднять без Telegram — вернуть пусто.
  return '';
}

export function tgReady() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#000000');
    tg.setBackgroundColor?.('#000000');
  } catch {
    /* ignore */
  }
}

/** Вибрация телефона паттерном (мс): [вибро, пауза, вибро, ...]. Фолбэк для обычных браузеров. */
export function tgVibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function tgHaptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light') {
  const tg = getTelegramWebApp();
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
      tg?.HapticFeedback?.notificationOccurred?.(kind);
    } else {
      tg?.HapticFeedback?.impactOccurred?.(kind);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Вибрация «как уведомление»: двойной/тройной импульс.
 * Использует Telegram notification-haptic + navigator.vibrate как фолбэк.
 */
export function tgNotify(kind: 'success' | 'error' | 'warning' = 'success') {
  tgHaptic(kind);
  const pattern =
    kind === 'error'
      ? [0, 120, 60, 120, 60, 220] // потоплен — длиннее
      : kind === 'warning'
      ? [0, 90, 50, 90]
      : [0, 80, 45, 80]; // попадание — двойной буз, как push-уведомление
  tgVibrate(pattern);
}

export function tgShare(url: string, text: string) {
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    tg.openTelegramLink(link);
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
  }
}

export function tgUserName(): string | undefined {
  const tg = getTelegramWebApp();
  return tg?.initDataUnsafe?.user?.username ?? tg?.initDataUnsafe?.user?.first_name;
}
