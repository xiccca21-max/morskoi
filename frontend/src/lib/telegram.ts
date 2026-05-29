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
