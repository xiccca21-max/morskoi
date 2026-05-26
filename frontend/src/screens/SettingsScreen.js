import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { setAuthToken } from '../api/http';
import { useAuthStore } from '../stores/auth-store';
export default function SettingsScreen() {
    const setUser = useAuthStore((s) => s.setUser);
    const [haptics, setHaptics] = useState(true);
    const [sound, setSound] = useState(true);
    const logout = () => {
        setAuthToken(null);
        setUser(null);
        window.location.reload();
    };
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsx("h2", { className: "font-display text-cyber-cyan tracking-widest text-sm", children: "\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418" }), _jsxs("section", { className: "card p-4 space-y-1", children: [_jsx(Toggle, { label: "\u0412\u0438\u0431\u0440\u0430\u0446\u0438\u044F", value: haptics, onChange: setHaptics }), _jsx(Toggle, { label: "\u0417\u0432\u0443\u043A", value: sound, onChange: setSound })] }), _jsxs("section", { className: "card p-4", children: [_jsx("h3", { className: "font-display text-cyber-cyan text-sm tracking-widest mb-2", children: "\u041E \u0418\u0413\u0420\u0415" }), _jsx("p", { className: "text-white/70 text-sm leading-relaxed", children: "Naval Clash \u2014 \u044D\u0442\u043E PvP-\u043C\u043E\u0440\u0441\u043A\u043E\u0439 \u0431\u043E\u0439 \u0441 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u043C\u0438 \u0441\u0442\u0430\u0432\u043A\u0430\u043C\u0438. \u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u043D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u0438\u0433\u0440\u0430\u0435\u0442 \u043F\u0440\u043E\u0442\u0438\u0432 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439: \u043E\u043D\u0430 \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E 5% rake \u0441 \u043F\u0440\u0438\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u0443\u043B\u0430." })] }), _jsx("button", { className: "btn-danger w-full", onClick: logout, children: "\u0412\u044B\u0439\u0442\u0438" })] }));
}
function Toggle({ label, value, onChange }) {
    return (_jsxs("button", { className: "flex items-center justify-between w-full py-3 px-2 rounded-lg hover:bg-white/5", onClick: () => onChange(!value), children: [_jsx("span", { children: label }), _jsx("span", { className: [
                    'w-11 h-6 rounded-full p-0.5 transition relative',
                    value ? 'bg-cyber-cyan' : 'bg-navy-700',
                ].join(' '), children: _jsx("span", { className: [
                        'block w-5 h-5 rounded-full bg-white transition',
                        value ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ') }) })] }));
}
