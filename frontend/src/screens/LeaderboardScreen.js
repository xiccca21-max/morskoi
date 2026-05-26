import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { LeaderboardAPI } from '../api/endpoints';
export default function LeaderboardScreen() {
    const [tab, setTab] = useState('wins');
    const [items, setItems] = useState([]);
    useEffect(() => {
        LeaderboardAPI.top(tab, 50).then(setItems).catch(() => { });
    }, [tab]);
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-3", children: [_jsx("h2", { className: "font-display text-cyber-cyan tracking-widest text-sm", children: "\u041B\u0418\u0414\u0415\u0420\u0411\u041E\u0420\u0414" }), _jsxs("div", { className: "card p-1 flex", children: [_jsx("button", { onClick: () => setTab('wins'), className: ['flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'wins' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' '), children: "\uD83C\uDFC6 \u041F\u043E\u0431\u0435\u0434\u044B" }), _jsx("button", { onClick: () => setTab('earnings'), className: ['flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'earnings' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' '), children: "\uD83D\uDCB0 \u0417\u0430\u0440\u0430\u0431\u043E\u0442\u043E\u043A" })] }), _jsx("ul", { className: "space-y-1.5", children: items.map((u) => (_jsxs("li", { className: "card p-3 flex items-center gap-3", children: [_jsxs("div", { className: ['w-8 text-center font-display',
                                u.rank === 1 ? 'text-cyber-gold' :
                                    u.rank === 2 ? 'text-white' :
                                        u.rank === 3 ? 'text-orange-400' : 'text-white/40'].join(' '), children: ["#", u.rank] }), u.avatar
                            ? _jsx("img", { src: u.avatar, className: "w-8 h-8 rounded-full", alt: "" })
                            : _jsx("div", { className: "w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-xs", children: u.name?.[0] ?? '?' }), _jsx("div", { className: "flex-1 text-sm", children: u.name }), _jsx("div", { className: "text-sm", children: tab === 'wins' ? _jsxs("span", { className: "text-sonar-400", children: [u.wins, " W"] }) :
                                _jsxs("span", { className: "text-cyber-cyan", children: ["$", u.totalWon.toFixed(2)] }) })] }, u.id))) })] }));
}
