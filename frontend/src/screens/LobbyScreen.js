import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI } from '../api/endpoints';
import { tgShare } from '../lib/telegram';
export default function LobbyScreen() {
    const { code } = useParams();
    const navigate = useNavigate();
    const [lobby, setLobby] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!code)
            return;
        MatchmakingAPI.getLobby(code).then(setLobby).catch((e) => setError(e?.response?.data?.message ?? 'Лобби не найдено'));
    }, [code]);
    const share = () => {
        if (!lobby)
            return;
        const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
        const url = `https://t.me/${botUser}?startapp=lobby_${lobby.code}`;
        tgShare(url, `⚓ Дуэль в Naval Clash! Ставка $${lobby.wagerAmount}. Код: ${lobby.code}`);
    };
    if (error)
        return _jsx("div", { className: "card p-6 text-cyber-red", children: error });
    if (!lobby)
        return _jsx("div", { className: "card p-6", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" });
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsx("h2", { className: "font-display text-cyber-cyan tracking-widest text-sm", children: "\u041F\u0420\u0418\u0412\u0410\u0422\u041D\u041E\u0415 \u041B\u041E\u0411\u0411\u0418" }), _jsxs("div", { className: "card p-6 text-center", children: [_jsx("p", { className: "text-white/60 text-sm", children: "\u041A\u043E\u0434 \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F" }), _jsx("p", { className: "font-display text-5xl tracking-[0.3em] text-cyber-cyan mt-2", children: lobby.code }), _jsxs("p", { className: "text-white/60 text-sm mt-2", children: ["\u0421\u0442\u0430\u0432\u043A\u0430: ", _jsxs("b", { children: ["$", lobby.wagerAmount] })] }), _jsxs("p", { className: "text-white/40 text-xs mt-2", children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", lobby.status] })] }), _jsx("button", { className: "btn-primary w-full", onClick: share, children: "\uD83D\uDCE8 \u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u0441\u0441\u044B\u043B\u043A\u043E\u0439" }), _jsx("button", { className: "btn-ghost w-full", onClick: () => navigate('/matchmaking'), children: "\u041D\u0430\u0437\u0430\u0434" })] }));
}
