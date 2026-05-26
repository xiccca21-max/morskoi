import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
export default function SplashScreen() {
    const navigate = useNavigate();
    const { ready, authenticated } = useAuthStore();
    useEffect(() => {
        if (ready && authenticated) {
            const t = setTimeout(() => navigate('/home'), 900);
            return () => clearTimeout(t);
        }
    }, [ready, authenticated, navigate]);
    return (_jsxs("div", { className: "min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center", children: [_jsxs(motion.div, { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.6 }, className: "relative w-44 h-44 rounded-full border-2 border-cyber-cyan/60 flex items-center justify-center shadow-glow", children: [_jsx("div", { className: "absolute inset-0 rounded-full", style: {
                            background: 'conic-gradient(from 0deg, transparent 70%, rgba(34,211,238,0.35) 88%, transparent 100%)',
                            animation: 'radarSweep 2.4s linear infinite',
                        } }), _jsx("span", { className: "font-display text-5xl", children: "\u2693" })] }), _jsx(motion.h1, { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.3, duration: 0.5 }, className: "font-display text-3xl mt-8 tracking-[0.4em] text-cyber-cyan", children: "NAVAL CLASH" }), _jsx(motion.p, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.6, duration: 0.5 }, className: "text-white/60 mt-2", children: "PvP \u041C\u043E\u0440\u0441\u043A\u043E\u0439 \u0431\u043E\u0439 \u0441\u043E \u0441\u0442\u0430\u0432\u043A\u0430\u043C\u0438" }), _jsx(motion.p, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 1.2, duration: 0.5 }, className: "text-cyber-cyan/80 text-xs mt-12 animate-pulse", children: ready ? 'Готово…' : 'Соединение с фронтом…' })] }));
}
