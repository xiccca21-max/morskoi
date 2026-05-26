import axios from 'axios';
// По умолчанию используем относительный путь — тогда Vite proxy (dev)
// или nginx (prod) сами перенаправят на backend. Это нужно для Telegram Mini App,
// которая открывается через HTTPS-туннель и не может ходить на http://localhost:4000.
const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';
export const api = axios.create({
    baseURL,
    timeout: 15000,
});
let _token = null;
export function setAuthToken(token) {
    _token = token;
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        try {
            localStorage.setItem('naval_token', token);
        }
        catch { }
    }
    else {
        delete api.defaults.headers.common.Authorization;
        try {
            localStorage.removeItem('naval_token');
        }
        catch { }
    }
}
export function loadToken() {
    try {
        const t = localStorage.getItem('naval_token');
        if (t) {
            _token = t;
            api.defaults.headers.common.Authorization = `Bearer ${t}`;
        }
        return _token;
    }
    catch {
        return null;
    }
}
export function getToken() {
    return _token;
}
