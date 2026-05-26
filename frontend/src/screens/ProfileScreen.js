import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { tgShare } from '../lib/telegram';
export default function ProfileScreen() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    if (!user)
        return null;
    const total = user.wins + user.losses;
    const wr = total ? Math.round((user.wins / total) * 100) : 0;
    const invite = () => {
        const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
        tgShare(`https://t.me/${botUser}`, '⚓ Сразимся в Naval Clash — PvP морской бой со ставками!');
    };
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsxs("section", { className: "card p-6 flex items-center gap-4", children: [user.avatar
                        ? _jsx("img", { src: user.avatar, className: "w-16 h-16 rounded-full", alt: "" })
                        : _jsx("div", { className: "w-16 h-16 rounded-full bg-cyber-cyan/20 flex items-center justify-center font-display text-2xl", children: user.firstName?.[0] ?? user.username?.[0] ?? '?' }), _jsxs("div", { children: [_jsx("h2", { className: "font-display text-xl", children: user.firstName ?? user.username ?? 'Captain' }), user.username && _jsxs("p", { className: "text-white/50 text-sm", children: ["@", user.username] })] })] }), _jsxs("section", { className: "grid grid-cols-3 gap-2 text-center", children: [_jsx(Stat, { label: "\u041F\u043E\u0431\u0435\u0434\u044B", value: user.wins, accent: "text-sonar-400" }), _jsx(Stat, { label: "\u041F\u043E\u0440\u0430\u0436\u0435\u043D\u0438\u044F", value: user.losses, accent: "text-cyber-red" }), _jsx(Stat, { label: "Winrate", value: `${wr}%`, accent: "text-cyber-cyan" })] }), _jsxs("section", { className: "card p-5", children: [_jsx("h3", { className: "font-display text-cyber-cyan text-sm tracking-widest mb-2", children: "\u0414\u0415\u0419\u0421\u0422\u0412\u0418\u042F" }), _jsxs("div", { className: "space-y-2", children: [_jsx("button", { className: "btn-secondary w-full", onClick: () => navigate('/wallet'), children: "\uD83D\uDCB0 \u041A\u043E\u0448\u0435\u043B\u0451\u043A" }), _jsx("button", { className: "btn-secondary w-full", onClick: () => navigate('/history'), children: "\uD83D\uDCDC \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0431\u043E\u0451\u0432" }), _jsx("button", { className: "btn-secondary w-full", onClick: () => navigate('/settings'), children: "\u2699 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" }), _jsx("button", { className: "btn-primary w-full", onClick: invite, children: "\uD83D\uDCE8 \u041F\u0440\u0438\u0433\u043B\u0430\u0441\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u0430" })] })] })] }));
}
function Stat({ label, value, accent }) {
    return (_jsxs("div", { className: "card p-3", children: [_jsx("div", { className: `font-display text-2xl ${accent}`, children: value }), _jsx("div", { className: "text-[10px] uppercase tracking-wider text-white/50", children: label })] }));
}
