import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { useEffect } from 'react';
export function Layout() {
    const user = useAuthStore((s) => s.user);
    const match = useMatchStore((s) => s.state);
    const navigate = useNavigate();
    const loc = useLocation();
    // Авто-навигация при активном матче
    useEffect(() => {
        if (!match)
            return;
        const p = loc.pathname;
        if (match.gameStatus === 'PLACEMENT' && !p.startsWith('/placement')) {
            navigate(`/placement/${match.matchId}`);
        }
        else if (match.gameStatus === 'IN_PROGRESS' && !p.startsWith('/battle')) {
            navigate(`/battle/${match.matchId}`);
        }
        else if (match.gameStatus === 'FINISHED' && !p.startsWith('/result')) {
            navigate(`/result/${match.matchId}`);
        }
    }, [match?.matchId, match?.gameStatus]); // eslint-disable-line
    const hideBottomNav = loc.pathname.startsWith('/placement') ||
        loc.pathname.startsWith('/battle') ||
        loc.pathname.startsWith('/result') ||
        loc.pathname.startsWith('/lobby');
    return (_jsxs("div", { className: "min-h-[100dvh] flex flex-col", children: [_jsxs("header", { className: "px-4 pt-3 pb-2 flex items-center justify-between sticky top-0 z-30 bg-navy-950/80 backdrop-blur border-b border-white/5", children: [_jsx(NavLink, { to: "/home", className: "font-display text-lg text-cyber-cyan tracking-widest", children: "NAVAL \u00B7 CLASH" }), _jsxs(NavLink, { to: "/wallet", className: "flex items-center gap-2 card px-3 py-1.5", children: [_jsx("span", { className: "text-cyber-cyan", children: "\u26A1" }), _jsxs("span", { className: "font-semibold", children: ["$", user?.balance?.toFixed(2) ?? '0.00'] })] })] }), _jsx(motion.main, { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 }, className: "flex-1 px-4 py-4 pb-24", children: _jsx(Outlet, {}) }, loc.pathname), !hideBottomNav && (_jsx("nav", { className: "fixed bottom-0 inset-x-0 z-40 px-4 pb-3 pt-2 bg-navy-950/95 backdrop-blur border-t border-white/5", children: _jsxs("ul", { className: "flex items-center justify-around text-xs", children: [_jsx(NavTab, { to: "/home", icon: "\u2693", label: "\u0413\u043B\u0430\u0432\u043D\u0430\u044F" }), _jsx(NavTab, { to: "/matchmaking", icon: "\u2694", label: "\u0418\u0433\u0440\u0430" }), _jsx(NavTab, { to: "/leaderboard", icon: "\uD83C\uDFC6", label: "\u0422\u043E\u043F" }), _jsx(NavTab, { to: "/history", icon: "\uD83D\uDCDC", label: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" }), _jsx(NavTab, { to: "/profile", icon: "\uD83D\uDC64", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C" })] }) }))] }));
}
function NavTab({ to, icon, label }) {
    return (_jsx("li", { children: _jsxs(NavLink, { to: to, className: ({ isActive }) => [
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition',
                isActive ? 'text-cyber-cyan bg-cyber-cyan/10 shadow-glow' : 'text-white/60 hover:text-white',
            ].join(' '), children: [_jsx("span", { className: "text-base", children: icon }), _jsx("span", { children: label })] }) }));
}
