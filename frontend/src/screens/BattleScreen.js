import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../components/Board';
import { Explosion, Splash } from '../components/Effects';
import { getSocket, newNonce } from '../api/socket';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';
export default function BattleScreen() {
    const { matchId } = useParams();
    const navigate = useNavigate();
    const state = useMatchStore((s) => s.state);
    const lastAttack = useMatchStore((s) => s.lastAttack);
    const me = useAuthStore((s) => s.user);
    const [now, setNow] = useState(Date.now());
    const [hover, setHover] = useState(null);
    const [explosionKey, setExplosionKey] = useState(0);
    const [splashKey, setSplashKey] = useState(0);
    const [view, setView] = useState('enemy');
    // Запрос состояния при входе
    useEffect(() => {
        if (matchId) {
            getSocket().emit('match:requestState', { matchId });
        }
    }, [matchId]);
    // timers
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, []);
    // hit/miss эффекты
    useEffect(() => {
        if (!lastAttack)
            return;
        if (lastAttack.hit) {
            setExplosionKey((k) => k + 1);
            tgHaptic(lastAttack.sunk ? 'error' : 'heavy');
        }
        else {
            setSplashKey((k) => k + 1);
            tgHaptic('light');
        }
    }, [lastAttack?.ts]); // eslint-disable-line
    // Переходы
    useEffect(() => {
        if (state?.gameStatus === 'FINISHED' && matchId)
            navigate(`/result/${matchId}`);
    }, [state?.gameStatus, matchId, navigate]);
    const myTurn = state?.currentTurn === me?.id;
    const deadline = state?.turnDeadline ? new Date(state.turnDeadline).getTime() : 0;
    const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
    const enemyAttacks = state?.enemy.view.attacks ?? [];
    const ownAttacks = state?.me.own.attacks ?? [];
    const ownShips = state?.me.own.ships ?? [];
    const enemySunk = useMemo(() => (state?.enemy.view.sunkShips ?? []).length, [state?.enemy.view.sunkShips]);
    const ownSunk = useMemo(() => ownShips.filter((s) => s.sunk).length, [ownShips]);
    const attack = (x, y) => {
        if (!myTurn || !matchId)
            return;
        if (enemyAttacks.some((a) => a.x === x && a.y === y))
            return;
        getSocket().emit('game:attack', { matchId, x, y, nonce: newNonce() }, (_ack) => { });
    };
    const surrender = () => {
        if (!matchId)
            return;
        if (!confirm('Сдаться? Соперник получит выигрыш.'))
            return;
        getSocket().emit('game:surrender', { matchId, nonce: newNonce() });
    };
    if (!state) {
        return (_jsx("div", { className: "card p-6 text-center", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0431\u043E\u044F\u2026" }));
    }
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsxs("div", { className: "card p-3 flex items-center justify-between", children: [_jsxs("div", { className: "text-xs", children: [_jsx("p", { className: "text-white/40", children: "\u041F\u0440\u0438\u0437\u043E\u0432\u043E\u0439 \u0444\u043E\u043D\u0434" }), _jsxs("p", { className: "font-display text-cyber-cyan", children: ["$", state.prizePool.toFixed(2)] })] }), _jsx("div", { className: "text-center", children: _jsx(TurnIndicator, { myTurn: myTurn, remaining: remaining }) }), _jsx("button", { onClick: surrender, className: "btn-ghost text-xs py-1.5 px-3", children: "\u0421\u0434\u0430\u0442\u044C\u0441\u044F" })] }), _jsxs("div", { className: "card p-1 flex", children: [_jsx("button", { onClick: () => setView('enemy'), className: ['flex-1 py-2 rounded-lg text-sm font-semibold', view === 'enemy' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' '), children: "\uD83C\uDFAF \u0410\u0442\u0430\u043A\u0430" }), _jsx("button", { onClick: () => setView('own'), className: ['flex-1 py-2 rounded-lg text-sm font-semibold', view === 'own' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' '), children: "\u2693 \u041C\u043E\u0439 \u0444\u043B\u043E\u0442" })] }), _jsx("div", { className: "relative", children: view === 'enemy' ? (_jsxs(_Fragment, { children: [_jsx(Board, { mode: "enemy", attacks: enemyAttacks, onCellClick: attack, onCellEnter: (x, y) => setHover({ x, y }), disabled: !myTurn, myTurn: myTurn, highlight: hover && myTurn ? hover : null }), _jsxs(AnimatePresence, { children: [lastAttack?.hit && lastAttack.by === me?.id && _jsx(Explosion, { keyId: explosionKey }), lastAttack?.hit === false && lastAttack?.by === me?.id && _jsx(Splash, { keyId: splashKey })] })] })) : (_jsx(Board, { mode: "own", ships: ownShips, attacks: ownAttacks, disabled: true })) }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(ScoreCard, { title: "\u0412\u0440\u0430\u0433 \u043F\u043E\u0442\u043E\u043F\u043B\u0435\u043D\u043E", value: enemySunk, max: 10, accent: "text-cyber-red" }), _jsx(ScoreCard, { title: "\u0421\u0432\u043E\u0438\u0445 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u043E", value: ownSunk, max: 10, accent: "text-cyber-gold" })] }), _jsx(motion.div, { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, className: "text-center text-sm text-white/60", children: myTurn
                    ? 'Тапни по вражеской клетке для атаки. Попадание — ещё ход.'
                    : 'Ход соперника. Жди…' })] }));
}
function TurnIndicator({ myTurn, remaining }) {
    return (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-white/40", children: myTurn ? 'Твой ход' : 'Ход соперника' }), _jsxs("p", { className: ['font-display text-2xl', myTurn ? 'text-sonar-400' : 'text-cyber-gold'].join(' '), children: [remaining, "s"] })] }));
}
function ScoreCard({ title, value, max, accent }) {
    const pct = Math.min(100, (value / max) * 100);
    return (_jsxs("div", { className: "card p-3", children: [_jsxs("div", { className: "flex justify-between text-xs mb-1", children: [_jsx("span", { className: "text-white/60", children: title }), _jsxs("span", { className: accent, children: [value, "/", max] })] }), _jsx("div", { className: "h-2 rounded-full bg-navy-800 overflow-hidden", children: _jsx("div", { className: `h-full ${accent === 'text-cyber-red' ? 'bg-cyber-red' : 'bg-cyber-gold'}`, style: { width: `${pct}%` } }) })] }));
}
