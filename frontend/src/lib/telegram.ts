// Утилиты для работы с Telegram WebApp SDK

const TG_INIT_KEY = 'tg_init_data';

function storeInitData(raw: string | null | undefined): void {
  if (!raw) return;
  try {
    sessionStorage.setItem(TG_INIT_KEY, raw);
  } catch {
    /* ignore */
  }
}

/** Сохранить initData из hash/query до того, как роутер изменит URL. */
function captureInitDataFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const hash = window.location.hash.slice(1);
    if (hash.includes('tgWebAppData=')) {
      const p = new URLSearchParams(hash);
      storeInitData(p.get('tgWebAppData'));
    }
    const q = new URLSearchParams(window.location.search);
    storeInitData(q.get('tgWebAppData'));
  } catch {
    /* ignore */
  }
}

// Выполняем сразу при импорте модуля — до React Router.
captureInitDataFromUrl();

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

/** Запущены ли мы внутри Telegram (WebView), даже если initData ещё не прочитан. */
export function isTelegramWebView(): boolean {
  try {
    if (sessionStorage.getItem(TG_INIT_KEY)) return true;
  } catch { /* ignore */ }
  const tg = getTelegramWebApp();
  if (!tg) return false;
  if (tg.initData?.length) return true;
  if (tg.initDataUnsafe?.user) return true;
  // telegram-web-app.js в обычном Chrome даёт platform=unknown без initData — не считаем TG.
  const p = tg.platform as string | undefined;
  if (p && p !== 'unknown') return true;
  return false;
}

/** Запущены ли мы внутри настоящего Telegram-клиента с данными для входа. */
export function isTelegram(): boolean {
  return !!getInitData();
}

interface MainButtonOpts {
  text: string;
  onClick: () => void;
  active?: boolean;
  progress?: boolean;
}

/**
 * Управление нативной нижней кнопкой Telegram (MainButton).
 * Возвращает cleanup, который прячет кнопку и снимает обработчик.
 */
export function tgMainButton(opts: MainButtonOpts | null) {
  const tg = getTelegramWebApp();
  const mb = tg?.MainButton;
  if (!mb) return () => {};
  let handler: (() => void) | null = null;
  try {
    if (!opts) {
      mb.hide();
    } else {
      mb.setText(opts.text.toUpperCase());
      // Перекрашиваем нативную кнопку в фирменный красный (вместо синего Telegram),
      // подхватывая активную тему через CSS-переменную --c-danger-rgb.
      try {
        const rgb = getComputedStyle(document.documentElement)
          .getPropertyValue('--c-danger-rgb')
          .trim();
        if (rgb) {
          const [r, g, b] = rgb.split(/[\s,]+/).map((v) => Number(v));
          if ([r, g, b].every((v) => Number.isFinite(v))) {
            const hex =
              '#' +
              [r, g, b]
                .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
                .join('');
            mb.setParams?.({ color: hex, text_color: '#ffffff' });
          }
        }
      } catch {
        /* ignore — оставим тему Telegram по умолчанию */
      }
      if (opts.active === false) mb.disable();
      else mb.enable();
      if (opts.progress) mb.showProgress?.(false);
      else mb.hideProgress?.();
      handler = opts.onClick;
      mb.onClick(handler);
      mb.show();
    }
  } catch {
    /* ignore */
  }
  return () => {
    try {
      if (handler) mb.offClick(handler);
      mb.hideProgress?.();
      mb.hide();
    } catch {
      /* ignore */
    }
  };
}

export function getInitData(): string {
  const tg = getTelegramWebApp();
  if (tg?.initData) return tg.initData as string;
  try {
    const stored = sessionStorage.getItem(TG_INIT_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return '';
}

/** Ждём появления initData (SDK или ранний захват из URL). */
export async function waitForInitData(maxMs = 10000): Promise<string> {
  tgReady();
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const d = getInitData();
    if (d) return d;
    captureInitDataFromUrl();
    tgReady();
    await new Promise((r) => setTimeout(r, 100));
  }
  return getInitData();
}

/** start_param из Telegram (?startapp=...) — например `lobby_AB12CD`. */
export function getStartParam(): string | undefined {
  const tg = getTelegramWebApp();
  const p = tg?.initDataUnsafe?.start_param;
  if (p) return p as string;
  // Фолбэк для обычного браузера: ?startapp=... или ?tgWebAppStartParam=...
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get('startapp') ?? q.get('tgWebAppStartParam') ?? undefined;
  } catch {
    return undefined;
  }
}

let hapticsAllowed = () => true;
/** Позволяет gate-ить вибрацию по настройкам пользователя. */
export function setHapticsGate(fn: () => boolean) {
  hapticsAllowed = fn;
}

let backButtonVisible = false;
let backButtonHandler: (() => void) | null = null;

/** Управление нативной кнопкой «Назад» в Telegram (без лишних show/hide — иначе мигает «Закрыть»). */
export function tgBackButton(show: boolean, onClick?: () => void) {
  const tg = getTelegramWebApp();
  const bb = tg?.BackButton;
  if (!bb) return () => {};
  try {
    if (show) {
      if (backButtonHandler && backButtonHandler !== onClick) {
        bb.offClick(backButtonHandler);
      }
      if (onClick) {
        backButtonHandler = onClick;
        bb.onClick(onClick);
      }
      if (!backButtonVisible) {
        bb.show();
        backButtonVisible = true;
      }
    } else if (backButtonVisible) {
      if (backButtonHandler) bb.offClick(backButtonHandler);
      backButtonHandler = null;
      bb.hide();
      backButtonVisible = false;
    }
  } catch {
    /* ignore */
  }
  return () => {
    try {
      if (onClick && backButtonHandler === onClick) bb.offClick(onClick);
      if (backButtonVisible) {
        bb.hide();
        backButtonVisible = false;
      }
      backButtonHandler = null;
    } catch {
      /* ignore */
    }
  };
}

/** Спрятать «Назад» на обычных экранах (один вызов из Layout). */
export function tgBackButtonHide() {
  tgBackButton(false);
}

let closingConfirmEnabled = false;

/** Подтверждение закрытия мини-аппа (чтобы не выйти случайно во время боя). */
export function tgClosingConfirmation(enable: boolean) {
  const tg = getTelegramWebApp();
  if (!tg) return;
  if (enable === closingConfirmEnabled) return;
  try {
    if (enable) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
    closingConfirmEnabled = enable;
  } catch {
    /* ignore */
  }
}

/** Блокировка вертикального свайпа (свайп вниз закрывает аппку — мешает в бою). */
export function tgVerticalSwipes(enable: boolean) {
  const tg = getTelegramWebApp();
  try {
    if (enable) tg?.enableVerticalSwipes?.();
    else tg?.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
}

export function tgReady() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    // Цвета шапки/фона выставляются в App.tsx по активной теме —
    // здесь не хардкодим, чтобы на светлой теме не было чёрной вспышки.
  } catch {
    /* ignore */
  }
}

/** Вибрация телефона паттерном (мс): [вибро, пауза, вибро, ...]. Фолбэк для обычных браузеров. */
export function tgVibrate(pattern: number | number[]) {
  if (!hapticsAllowed()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function tgHaptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light') {
  if (!hapticsAllowed()) return;
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

/** URL подходит для Telegram.WebApp.openInvoice (только mini-app invoice link). */
export function isTelegramInvoiceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 't.me' && u.hostname !== 'telegram.me') return false;
    // Crypto Pay mini-app invoice: t.me/CryptoBot/app?startapp=...
    if (u.pathname.includes('/app')) return true;
    // Bot API invoice slug: t.me/$bot/...
    if (u.pathname.startsWith('/$')) return true;
    return false;
  } catch {
    return false;
  }
}

/** Открыть счёт Crypto Pay: openInvoice только для mini-app URL, иначе — ссылка в @CryptoBot. */
export function tgOpenPayment(url: string, onDone?: (status: string) => void) {
  // Платёжная ссылка приходит с сервера — открываем только доверенные форматы:
  // mini-app invoice (t.me) через openInvoice, иначе только https через tgOpenLink.
  let isHttps = false;
  try {
    isHttps = new URL(url).protocol === 'https:';
  } catch {
    isHttps = false;
  }
  if (!isHttps && !isTelegramInvoiceUrl(url)) return;

  const tg = getTelegramWebApp();
  if (tg?.openInvoice && isTelegramInvoiceUrl(url)) {
    try {
      tg.openInvoice(url, (status: string) => onDone?.(status));
      return;
    } catch {
      /* invalid for openInvoice — fallback below */
    }
  }
  tgOpenLink(url);
}

/** Точная проверка, что ссылка ведёт на Telegram (t.me/telegram.me), без обхода подстрокой. */
function isTelegramHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 't.me' || u.hostname === 'telegram.me');
  } catch {
    return false;
  }
}

/** Открыть ссылку (t.me — через Telegram, иначе в браузере). Только http(s). */
export function tgOpenLink(url: string) {
  // Защита от javascript:/data: и прочих схем.
  try {
    const proto = new URL(url).protocol;
    if (proto !== 'https:' && proto !== 'http:') return;
  } catch {
    return;
  }
  const tg = getTelegramWebApp();
  if (isTelegramHost(url) && tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
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

/** URL аватарки из Telegram (если доступен). */
export function tgPhotoUrl(): string | undefined {
  const tg = getTelegramWebApp();
  return tg?.initDataUnsafe?.user?.photo_url;
}
