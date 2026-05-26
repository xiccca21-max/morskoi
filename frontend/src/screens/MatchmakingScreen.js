import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { MatchmakingAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgShare } from '../lib/telegram';
const PRESETS = [1, 5, 10, 25, 50];
export default function MatchmakingScreen() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [wager, setWager] = useState(5);
    const [tab, setTab] = useState('quick');
    const [searching, setSearching] = useState(false);
    const [lobbyCode, setLobbyCode] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState(null);
    const timerRef = useRef(null);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const sock = getSocket();
        const onFound = (data) => {
            tgHaptic('success');
            navigate(`/placement/${data.matchId}`);
        };
        sock.on('match:found', onFound);
        return () => {
            sock.off('match:found', onFound);
        };
    }, [navigate]);
    useEffect(() => {
        if (!searching)
            return;
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
        return () => { if (timerRef.current)
            clearInterval(timerRef.current); };
    }, [searching]);
    const startQuick = async () => {
        if (!user || user.balance < wager) {
            setError('Недостаточно средств');
            return;
        }
        setError(null);
        setSearching(true);
        tgHaptic('medium');
        try {
            const sock = getSocket();
            sock.emit('mm:join', { wagerAmount: wager, nonce: newNonce() }, (ack) => {
                if (!ack?.ok) {
                    setError(ack?.error ?? 'Ошибка');
                    setSearching(false);
                    return;
                }
                if (ack.matched && ack.matchId)
                    navigate(`/placement/${ack.matchId}`);
            });
        }
        catch (e) {
            setError(e?.message ?? 'Ошибка');
            setSearching(false);
        }
    };
    const cancelSearch = async () => {
        try {
            getSocket().emit('mm:leave');
        }
        catch { }
        await MatchmakingAPI.leave().catch(() => { });
        setSearching(false);
    };
    const createPrivate = async () => {
        if (!user || user.balance < wager) {
            setError('Недостаточно средств');
            return;
        }
        setError(null);
        try {
            const l = await MatchmakingAPI.createLobby(wager);
            setLobbyCode(l.code);
            tgHaptic('success');
        }
        catch (e) {
            setError(e?.response?.data?.message ?? e?.message);
        }
    };
    const joinPrivate = async () => {
        if (!joinCode)
            return;
        setError(null);
        try {
            const sock = getSocket();
            sock.emit('lobby:join', { code: joinCode.toUpperCase(), nonce: newNonce() }, (ack) => {
                if (!ack?.ok) {
                    setError(ack?.error ?? 'Ошибка');
                    return;
                }
                navigate(`/placement/${ack.matchId}`);
            });
        }
        catch (e) {
            setError(e?.message);
        }
    };
    const shareInvite = () => {
        if (!lobbyCode)
            return;
        const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
        const url = `https://t.me/${botUser}?startapp=lobby_${lobbyCode}`;
        tgShare(url, `⚓ Вызов на дуэль в Naval Clash! Ставка $${wager}. Код: ${lobbyCode}`);
    };
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsx("h2", { className: "font-display text-cyber-cyan tracking-widest text-sm", children: "\u041F\u041E\u0418\u0421\u041A \u0411\u041E\u042F" }), _jsxs("div", { className: "card p-1 flex", children: [_jsx(TabBtn, { active: tab === 'quick', onClick: () => setTab('quick'), children: "\u26A1 \u0411\u044B\u0441\u0442\u0440\u0430\u044F" }), _jsx(TabBtn, { active: tab === 'private', onClick: () => setTab('private'), children: "\uD83D\uDD12 \u041F\u0440\u0438\u0432\u0430\u0442\u043D\u0430\u044F" })] }), _jsxs("div", { className: "card p-5", children: [_jsx("label", { className: "block text-xs uppercase tracking-widest text-white/60 mb-2", children: "\u0421\u0442\u0430\u0432\u043A\u0430" }), _jsxs("div", { className: "flex items-baseline gap-2 mb-3", children: [_jsxs("span", { className: "font-display text-3xl text-cyber-cyan", children: ["$", wager] }), _jsx("span", { className: "text-white/40 text-sm", children: "\u0437\u0430 \u043C\u0430\u0442\u0447" })] }), _jsx("div", { className: "grid grid-cols-5 gap-1.5 mb-3", children: PRESETS.map((p) => (_jsxs("button", { onClick: () => setWager(p), className: [
                                'py-2 rounded-lg text-sm font-semibold transition',
                                wager === p ? 'bg-cyber-cyan text-navy-950' : 'bg-navy-800 text-white/80',
                            ].join(' '), children: ["$", p] }, p))) }), _jsx("input", { type: "range", min: 1, max: 100, step: 1, value: wager, onChange: (e) => setWager(Number(e.target.value)), className: "w-full accent-cyber-cyan" }), _jsxs("div", { className: "flex justify-between text-xs text-white/40 mt-1", children: [_jsx("span", { children: "$1" }), _jsx("span", { children: "$100" })] }), _jsx(PrizeBreakdown, { wager: wager })] }), error && _jsx("div", { className: "card p-3 text-cyber-red text-sm", children: error }), tab === 'quick' && (_jsx(_Fragment, { children: !searching ? (_jsx("button", { className: "btn-primary w-full text-lg", onClick: startQuick, children: "\u2694 \u041D\u0430\u0439\u0442\u0438 \u0441\u043E\u043F\u0435\u0440\u043D\u0438\u043A\u0430" })) : (_jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, className: "card p-6 flex flex-col items-center gap-3", children: [_jsx(SonarSearchAnimation, {}), _jsx("p", { className: "font-display text-cyber-cyan tracking-widest", children: "\u041F\u041E\u0418\u0421\u041A \u0421\u041E\u041F\u0415\u0420\u041D\u0418\u041A\u0410\u2026" }), _jsxs("p", { className: "text-white/60", children: [elapsed, "s \u00B7 \u0441\u0442\u0430\u0432\u043A\u0430 $", wager] }), _jsx("button", { className: "btn-danger mt-2", onClick: cancelSearch, children: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C" })] })) })), tab === 'private' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "card p-5 space-y-3", children: [_jsx("h3", { className: "font-display text-cyber-cyan text-sm tracking-widest", children: "\u0421\u041E\u0417\u0414\u0410\u0422\u042C \u041B\u041E\u0411\u0411\u0418" }), !lobbyCode ? (_jsx("button", { className: "btn-primary w-full", onClick: createPrivate, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0438\u043D\u0432\u0430\u0439\u0442" })) : (_jsxs("div", { className: "text-center space-y-2", children: [_jsx("p", { className: "text-white/60 text-xs", children: "\u041A\u043E\u0434 \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F:" }), _jsx("p", { className: "font-display text-4xl tracking-[0.3em] text-cyber-cyan", children: lobbyCode }), _jsx("button", { className: "btn-secondary w-full", onClick: shareInvite, children: "\uD83D\uDCE8 \u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F" })] }))] }), _jsxs("div", { className: "card p-5 space-y-3", children: [_jsx("h3", { className: "font-display text-cyber-cyan text-sm tracking-widest", children: "\u0412\u0412\u0415\u0421\u0422\u0418 \u041A\u041E\u0414" }), _jsx("input", { type: "text", value: joinCode, onChange: (e) => setJoinCode(e.target.value.toUpperCase()), placeholder: "ABCDEF", maxLength: 10, className: "w-full px-4 py-3 rounded-xl bg-navy-800 border border-white/10 text-center font-display tracking-[0.3em] focus:border-cyber-cyan outline-none" }), _jsx("button", { className: "btn-primary w-full", onClick: joinPrivate, disabled: !joinCode, children: "\u0412\u043E\u0439\u0442\u0438 \u0432 \u043B\u043E\u0431\u0431\u0438" })] })] }))] }));
}
function TabBtn({ active, onClick, children }) {
    return (_jsx("button", { onClick: onClick, className: [
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition',
            active ? 'bg-cyber-cyan text-navy-950' : 'text-white/70',
        ].join(' '), children: children }));
}
function PrizeBreakdown({ wager }) {
    const pool = wager * 2;
    const rake = +(pool * 0.05).toFixed(2);
    const win = +(pool - rake).toFixed(2);
    return (_jsxs("div", { className: "mt-4 rounded-xl bg-navy-800/60 p-3 text-sm grid grid-cols-3 gap-2 text-center", children: [_jsxs("div", { children: [_jsx("div", { className: "text-white/40 text-xs", children: "\u041F\u0440\u0438\u0437\u043E\u0432\u043E\u0439" }), _jsxs("div", { className: "text-white", children: ["$", pool] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-white/40 text-xs", children: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F 5%" }), _jsxs("div", { className: "text-cyber-red", children: ["\u2212$", rake] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-white/40 text-xs", children: "\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044E" }), _jsxs("div", { className: "text-sonar-400", children: ["$", win] })] })] }));
}
function SonarSearchAnimation() {
    return (_jsxs("div", { className: "relative w-40 h-40 rounded-full border-2 border-cyber-cyan/50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 rounded-full", style: {
                    background: 'conic-gradient(from 0deg, transparent 70%, rgba(34,211,238,0.4) 88%, transparent 100%)',
                    animation: 'radarSweep 2s linear infinite',
                } }), _jsx("span", { className: "absolute inset-6 rounded-full border border-cyber-cyan/40" }), _jsx("span", { className: "absolute inset-12 rounded-full border border-cyber-cyan/30" }), _jsx("span", { className: "font-display text-3xl", children: "\u2693" })] }));
}
