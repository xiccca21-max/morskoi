import axios from 'axios';
import { getInitData } from '../lib/telegram';
import { tokenStorageKey } from '../lib/telegram-account';

// По умолчанию используем относительный путь — тогда Vite proxy (dev)
// или nginx (prod) сами перенаправят на backend. Это нужно для Telegram Mini App,
// которая открывается через HTTPS-туннель и не может ходить на http://localhost:4000.
const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

// Telegram WebView агрессивно кэширует GET — список боёв «протухает» и join падает.
// Заставляем ревалидировать каждый GET (backend отдаёт no-store).
api.interceptors.request.use((config) => {
  const initData = getInitData();
  if (initData) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)['X-Telegram-Init-Data'] = initData;
  }
  if ((config.method ?? 'get').toLowerCase() === 'get') {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)['Cache-Control'] = 'no-cache';
    (config.headers as Record<string, string>)['Pragma'] = 'no-cache';
    config.params = { ...(config.params ?? {}), _t: Date.now() };
  }
  return config;
});

const LEGACY_TOKEN_KEY = 'naval_token';
let _token: string | null = null;

/** JWT привязан к telegram user id — на одном телефоне аккаунты не делят сессию. */
function persistToken(token: string | null) {
  const key = tokenStorageKey();
  try {
    if (token) {
      localStorage.setItem(key, token);
      sessionStorage.setItem(key, token);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    } else {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function setAuthToken(token: string | null) {
  _token = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    persistToken(token);
  } else {
    delete api.defaults.headers.common.Authorization;
    persistToken(null);
  }
}

/** Истёк ли JWT по полю exp (без доверия к payload — только парсинг времени). */
function isJwtExpired(token: string): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const json = JSON.parse(
      decodeURIComponent(
        atob(part.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      ),
    );
    if (typeof json.exp !== 'number') return false;
    return Date.now() >= json.exp * 1000;
  } catch {
    return false; // не смогли распарсить — пусть сервер решает (401)
  }
}

export function loadToken(): string | null {
  try {
    const key = tokenStorageKey();
    let t = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!t) {
      t = sessionStorage.getItem(LEGACY_TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
    }
    if (t && isJwtExpired(t)) {
      setAuthToken(null);
      return null;
    }
    if (t) {
      _token = t;
      api.defaults.headers.common.Authorization = `Bearer ${t}`;
    }
    return _token;
  } catch {
    return null;
  }
}

export function getToken() {
  return _token;
}

/** Текст ошибки из ответа Nest (message может быть строкой или массивом). */
export function getApiErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string' && m) return m;
  if (typeof e?.message === 'string') return e.message;
  return '';
}

// При 401 сбрасываем токен. Без window.location.reload(): в Telegram Mini App
// reload часто не отдаёт initData повторно → бесконечный «Загрузка».
// Стартовая проверка /users/me обрабатывается в App.tsx (catch → fresh login).
api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Только 401 (невалидный/просроченный токен) сбрасывает сессию.
    // 403 — это «аутентифицирован, но запрещено» (бан/самоисключение):
    // сброс здесь привёл бы к циклу логаута, поэтому не трогаем токен.
    if (err?.response?.status === 401) {
      setAuthToken(null);
    }
    return Promise.reject(err);
  },
);
