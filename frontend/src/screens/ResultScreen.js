import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { VictoryBurst } from '../components/Effects';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { GameAPI, WalletAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic } from '../lib/telegram';
export default function ResultScreen() {
    const { matchId } = useParams();
    const navigate = useNavigate();
    const matchState = useMatchStore((s) => s.state);
    const setMatchState = useMatchStore((s) => s.setState);
    const me = useAuthStore((s) => s.user);
    const updateBalance = useAuthStore((s) => s.updateBalance);
    const applyMatchResult = useAuthStore((s) => s.applyMatchResult);
    const [waitingRematch, setWaitingRematch] = useState(false);
    useEffect(() => {
        if (!matchId)
            return;
        GameAPI.state(matchId).then(setMatchState).catch(() => { });
        WalletAPI.balance().then((r) => updateBalance(r.balance)).catch(() => { });
    }, [matchId, setMatchState, updateBalance]);
    useEffect(() => {
        const sock = getSocket();
        const onRematch = (e) => {
            if (e.newMatchId)
                navigate(`/placement/${e.newMatchId}`);
        };
        sock.on('match:rematchStarted', onRematch);
        return () => { sock.off('match:rematchStarted', onRematch); };
    }, [navigate]);
    useEffect(() => {
        if (matchState?.winnerId && me?.id) {
            applyMatchResult(matchState.winnerId === me.id);
            tgHaptic(matchState.winnerId === me.id ? 'success' : 'error');
        }
    }, [matchState?.winnerId, me?.id]); // eslint-disable-line
    const won = matchState?.winnerId === me?.id;
    const draw = !matchState?.winnerId;
    const rematch = () => {
        if (!matchId)
            return;
        setWaitingRematch(true);
        getSocket().emit('match:rematch', { matchId, nonce: newNonce() }, (ack) => {
            if (!ack?.ok) {
                setWaitingRematch(false);
                alert(ack?.error);
            }
        });
    };
    const pool = matchState?.prizePool ?? 0;
    const rake = matchState?.rakeAmount ?? 0;
    const payout = +(pool - rake).toFixed(2);
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-5 pt-6", children: [_jsxs(motion.section, { initial: { scale: 0.85, opacity: 0 }, animate: { scale: 1, opacity: 1 }, className: "card p-8 text-center relative overflow-hidden", children: [won && _jsx(VictoryBurst, {}), _jsx("p", { className: "font-display tracking-[0.4em] text-xs text-white/50", children: draw ? 'НИЧЬЯ' : won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ' }), _jsx("p", { className: "font-display text-5xl mt-2", children: draw ? '🤝' : won ? '🏆' : '💀' }), !draw && (_jsx("p", { className: "font-display text-2xl mt-3 text-cyber-cyan", children: won ? `+$${payout.toFixed(2)}` : `−$${matchState?.wagerAmount.toFixed(2) ?? ''}` })), _jsxs("div", { className: "mt-4 grid grid-cols-3 gap-2 text-xs", children: [_jsx(Stat, { label: "\u041F\u0440\u0438\u0437\u043E\u0432\u043E\u0439", value: `$${pool.toFixed(2)}` }), _jsx(Stat, { label: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F", value: `$${rake.toFixed(2)}` }), _jsx(Stat, { label: "\u0412\u044B\u043F\u043B\u0430\u0442\u0430", value: won ? `$${payout.toFixed(2)}` : '—' })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("button", { className: "btn-primary w-full text-lg", onClick: rematch, disabled: waitingRematch, children: waitingRematch ? 'Ожидание соперника…' : '⚔ Реванш' }), _jsx("button", { className: "btn-secondary w-full", onClick: () => navigate('/matchmaking'), children: "\u041D\u043E\u0432\u044B\u0439 \u0431\u043E\u0439" }), _jsx("button", { className: "btn-ghost w-full", onClick: () => navigate('/home'), children: "\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E" })] })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rounded-xl bg-navy-800/60 p-3", children: [_jsx("div", { className: "text-cyber-cyan font-display", children: value }), _jsx("div", { className: "text-[10px] uppercase tracking-wider text-white/50", children: label })] }));
}
