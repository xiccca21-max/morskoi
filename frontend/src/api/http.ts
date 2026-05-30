import axios from 'axios';

// По умолчанию используем относительный путь — тогда Vite proxy (dev)
// или nginx (prod) сами перенаправят на backend. Это нужно для Telegram Mini App,
// которая открывается через HTTPS-туннель и не может ходить на http://localhost:4000.
const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    try { localStorage.setItem('naval_token', token); } catch {}
  } else {
    delete api.defaults.headers.common.Authorization;
    try { localStorage.removeItem('naval_token'); } catch {}
  }
}

export function loadToken(): string | null {
  try {
    const t = localStorage.getItem('naval_token');
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

// Автоматический выход только при истёкшем/невалидном токене (401).
// 403 (доступ запрещён к конкретному ресурсу) НЕ должен разлогинивать —
// иначе бизнес-ошибки выкидывают пользователя из приложения.
let _reloadingAuth = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !_reloadingAuth) {
      _reloadingAuth = true;
      setAuthToken(null);
      window.location.reload();
    }
    return Promise.reject(err);
  },
);
