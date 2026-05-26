import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';
export default function HistoryScreen() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        HistoryAPI.list(50).then(setItems).catch(() => { });
    }, []);
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-3", children: [_jsx("h2", { className: "font-display text-cyber-cyan tracking-widest text-sm", children: "\u0418\u0421\u0422\u041E\u0420\u0418\u042F \u041C\u0410\u0422\u0427\u0415\u0419" }), items.length === 0 && _jsx("div", { className: "card p-6 text-center text-white/40", children: "\u041F\u043E\u043A\u0430 \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0431\u043E\u044F" }), _jsx("ul", { className: "space-y-2", children: items.map((m) => (_jsxs("li", { className: "card p-4 flex items-center gap-3", children: [_jsx("div", { className: [
                                'w-10 h-10 rounded-xl flex items-center justify-center text-xl font-display',
                                m.result === 'win' ? 'bg-sonar-500/15 text-sonar-400' :
                                    m.result === 'loss' ? 'bg-cyber-red/15 text-cyber-red' :
                                        'bg-white/10 text-white/60'
                            ].join(' '), children: m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : '·' }), _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "text-sm", children: ["vs ", m.opponent?.name ?? 'Unknown'] }), _jsx("div", { className: "text-xs text-white/40", children: m.endedAt ? new Date(m.endedAt).toLocaleString() : '—' })] }), _jsx("div", { className: ['font-display', m.result === 'win' ? 'text-sonar-400' : 'text-white/70'].join(' '), children: m.result === 'win' ? `+$${(m.prizePool - m.rakeAmount).toFixed(2)}` :
                                m.result === 'loss' ? `−$${m.wagerAmount.toFixed(2)}` :
                                    `${m.wagerAmount.toFixed(2)}` })] }, m.id))) })] }));
}
