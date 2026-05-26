import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { tgReady, getInitData } from './lib/telegram';
import { AuthAPI } from './api/endpoints';
import { loadToken, setAuthToken } from './api/http';
import { getSocket, closeSocket } from './api/socket';
import { useAuthStore } from './stores/auth-store';
import { useMatchStore } from './stores/match-store';
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import WalletScreen from './screens/WalletScreen';
import MatchmakingScreen from './screens/MatchmakingScreen';
import LobbyScreen from './screens/LobbyScreen';
import PlacementScreen from './screens/PlacementScreen';
import BattleScreen from './screens/BattleScreen';
import ResultScreen from './screens/ResultScreen';
import HistoryScreen from './screens/HistoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import { Layout } from './components/Layout';
function Protected({ children }) {
    const { authenticated, ready } = useAuthStore();
    if (!ready)
        return _jsx(SplashScreen, {});
    if (!authenticated)
        return _jsx(Navigate, { to: "/", replace: true });
    return children;
}
export default function App() {
    const setUser = useAuthStore((s) => s.setUser);
    const setReady = useAuthStore((s) => s.setReady);
    const updateBalance = useAuthStore((s) => s.updateBalance);
    const setMatchState = useMatchStore((s) => s.setState);
    const setLastAttack = useMatchStore((s) => s.setLastAttack);
    const [authError, setAuthError] = useState(null);
    useEffect(() => {
        tgReady();
        let cancelled = false;
        (async () => {
            // 1. пробуем существующий токен
            const existing = loadToken();
            const initData = getInitData();
            try {
                if (initData) {
                    // если есть Telegram — всегда апдейтим (или создаём)
                    const { token, user } = await AuthAPI.login(initData);
                    if (cancelled)
                        return;
                    setAuthToken(token);
                    setUser({ ...user, balance: Number(user.balance) });
                }
                else if (existing) {
                    // без Telegram — пробуем GET /users/me чтобы валидировать токен
                    try {
                        const me = await import('./api/endpoints').then((m) => m.UsersAPI.me());
                        setUser({ ...me, balance: Number(me.balance) });
                    }
                    catch {
                        setAuthToken(null);
                        setAuthError('Откройте приложение через Telegram');
                    }
                }
                else {
                    setAuthError('Откройте приложение через Telegram');
                }
            }
            catch (e) {
                setAuthError(e?.response?.data?.message ?? e?.message ?? 'Auth failed');
            }
            finally {
                setReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [setReady, setUser]);
    // Подключение к сокету после логина + глобальные обработчики
    useEffect(() => {
        const unsub = useAuthStore.subscribe((s) => {
            if (s.authenticated) {
                const sock = getSocket();
                sock.on('connect_error', (e) => console.warn('socket connect_error', e.message));
                sock.on('auth:error', () => {
                    setAuthToken(null);
                    window.location.reload();
                });
                sock.on('match:state', (state) => {
                    setMatchState(state);
                });
                sock.on('match:attack', (a) => {
                    setLastAttack({ ...a, ts: Date.now() });
                });
                sock.on('match:found', () => {
                    // экран матчмейкинга сам подхватит из state
                });
                sock.on('match:finished', () => {
                    // ResultScreen покажется автоматически по статусу
                });
                sock.on('wallet:update', (b) => updateBalance(b));
            }
        });
        return () => {
            unsub();
            closeSocket();
        };
    }, [setMatchState, setLastAttack, updateBalance]);
    if (authError) {
        return (_jsx("div", { className: "h-full flex items-center justify-center p-8 text-center", children: _jsxs("div", { className: "card p-8 max-w-md", children: [_jsx("h1", { className: "font-display text-2xl text-cyber-cyan mb-3", children: "Naval Clash" }), _jsx("p", { className: "text-white/70 mb-4", children: authError }), _jsxs("p", { className: "text-xs text-white/50", children: ["\u042D\u0442\u043E Telegram Mini App. \u041E\u0442\u043A\u0440\u043E\u0439 \u0431\u043E\u0442\u0430", ' ', _jsxs("span", { className: "text-cyber-cyan", children: ["@", import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot'] }), " \u0438 \u043D\u0430\u0436\u043C\u0438 \u00AB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0433\u0440\u0443\u00BB."] })] }) }));
    }
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(SplashScreen, {}) }), _jsxs(Route, { element: _jsx(Protected, { children: _jsx(Layout, {}) }), children: [_jsx(Route, { path: "/home", element: _jsx(HomeScreen, {}) }), _jsx(Route, { path: "/wallet", element: _jsx(WalletScreen, {}) }), _jsx(Route, { path: "/matchmaking", element: _jsx(MatchmakingScreen, {}) }), _jsx(Route, { path: "/lobby/:code", element: _jsx(LobbyScreen, {}) }), _jsx(Route, { path: "/placement/:matchId", element: _jsx(PlacementScreen, {}) }), _jsx(Route, { path: "/battle/:matchId", element: _jsx(BattleScreen, {}) }), _jsx(Route, { path: "/result/:matchId", element: _jsx(ResultScreen, {}) }), _jsx(Route, { path: "/history", element: _jsx(HistoryScreen, {}) }), _jsx(Route, { path: "/leaderboard", element: _jsx(LeaderboardScreen, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfileScreen, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsScreen, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/home", replace: true }) })] }));
}
