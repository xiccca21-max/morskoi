import { jsx as _jsx } from "react/jsx-runtime";
import { AnimatePresence, motion } from 'framer-motion';
export function Explosion({ keyId }) {
    return (_jsx(AnimatePresence, { children: _jsx(motion.div, { className: "pointer-events-none absolute inset-0 flex items-center justify-center", initial: { opacity: 0, scale: 0.4 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0 }, transition: { duration: 0.5 }, children: _jsx("div", { className: "w-24 h-24 rounded-full bg-gradient-to-br from-yellow-300 via-red-500 to-red-900 shadow-[0_0_60px_30px_rgba(239,68,68,0.6)]" }) }, keyId) }));
}
export function Splash({ keyId }) {
    return (_jsx(AnimatePresence, { children: _jsx(motion.div, { className: "pointer-events-none absolute inset-0 flex items-center justify-center", initial: { opacity: 0, scale: 0.4 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0 }, transition: { duration: 0.5 }, children: _jsx("div", { className: "w-16 h-16 rounded-full bg-gradient-to-br from-sky-200/80 via-cyan-300/40 to-transparent shadow-[0_0_40px_20px_rgba(125,211,252,0.5)]" }) }, keyId) }));
}
export function MissileTrail({ from, to, keyId }) {
    return (_jsx(motion.svg, { className: "pointer-events-none absolute inset-0 w-full h-full", initial: { opacity: 1 }, animate: { opacity: 0 }, transition: { duration: 1.2, delay: 0.3 }, children: _jsx(motion.line, { x1: `${from.x}%`, y1: `${from.y}%`, x2: `${from.x}%`, y2: `${from.y}%`, animate: { x2: `${to.x}%`, y2: `${to.y}%` }, transition: { duration: 0.4, ease: 'easeOut' }, stroke: "rgba(251, 191, 36, 0.9)", strokeWidth: "3", strokeLinecap: "round", style: { filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.9))' } }) }, keyId));
}
export function VictoryBurst() {
    return (_jsx("div", { className: "pointer-events-none absolute inset-0 overflow-hidden", children: Array.from({ length: 40 }).map((_, i) => (_jsx(motion.span, { className: "absolute w-1.5 h-1.5 rounded-full bg-cyber-gold", style: {
                left: '50%',
                top: '50%',
                boxShadow: '0 0 8px rgba(251,191,36,0.9)',
            }, initial: { x: 0, y: 0, opacity: 1 }, animate: {
                x: Math.cos((i / 40) * Math.PI * 2) * (120 + Math.random() * 80),
                y: Math.sin((i / 40) * Math.PI * 2) * (120 + Math.random() * 80),
                opacity: 0,
            }, transition: { duration: 1.4, ease: 'easeOut', delay: Math.random() * 0.2 } }, i))) }));
}
