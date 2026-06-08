import { getInitData } from './telegram';

const ACTIVE_USER_KEY = 'nc_active_tg_user';

/** Telegram user id из initData (без серверной валидации — только для scoping storage). */
export function parseTelegramUserId(initData: string): number | null {
  try {
    const userRaw = new URLSearchParams(initData).get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id?: unknown };
    return typeof user.id === 'number' ? user.id : null;
  } catch {
    return null;
  }
}

export function currentTelegramUserId(): number | null {
  const initData = getInitData();
  return initData ? parseTelegramUserId(initData) : null;
}

export function tokenStorageKey(userId?: number | null): string {
  const id = userId ?? currentTelegramUserId();
  return id ? `naval_token_${id}` : 'naval_token';
}

/**
 * На одном телефоне Telegram-аккаунты делят localStorage WebView.
 * Если сменился user id — сбрасываем чужой JWT и legacy-ключи.
 * Возвращает true, если аккаунт сменился.
 */
export function ensureStorageForCurrentUser(): boolean {
  const initData = getInitData();
  if (!initData) return false;
  const userId = parseTelegramUserId(initData);
  if (!userId) return false;

  try {
    const prevRaw = localStorage.getItem(ACTIVE_USER_KEY);
    const prevId = prevRaw ? parseInt(prevRaw, 10) : null;
    localStorage.setItem(ACTIVE_USER_KEY, String(userId));

    if (prevId && prevId !== userId) {
      localStorage.removeItem('naval_token');
      sessionStorage.removeItem('naval_token');
      localStorage.removeItem(tokenStorageKey(prevId));
      sessionStorage.removeItem(tokenStorageKey(prevId));
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
