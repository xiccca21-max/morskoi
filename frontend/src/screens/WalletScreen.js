import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { WalletAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';
export default function WalletScreen() {
    const user = useAuthStore((s) => s.user);
    const updateBalance = useAuthStore((s) => s.updateBalance);
    const [amount, setAmount] = useState(10);
    const [txs, setTxs] = useState([]);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        WalletAPI.txs().then(setTxs).catch(() => { });
    }, []);
    const deposit = async () => {
        setBusy(true);
        try {
            const r = await WalletAPI.deposit(amount);
            updateBalance(r.balance);
            tgHaptic('success');
            WalletAPI.txs().then(setTxs);
        }
        finally {
            setBusy(false);
        }
    };
    const withdraw = async () => {
        setBusy(true);
        try {
            const r = await WalletAPI.withdraw(amount);
            updateBalance(r.balance);
            tgHaptic('success');
            WalletAPI.txs().then(setTxs);
        }
        catch (e) {
            tgHaptic('error');
            alert(e?.response?.data?.message ?? e?.message);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "max-w-md mx-auto space-y-4", children: [_jsxs("section", { className: "card p-6 text-center", children: [_jsx("p", { className: "text-white/60 text-sm", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0431\u0430\u043B\u0430\u043D\u0441" }), _jsxs("p", { className: "font-display text-4xl text-cyber-cyan mt-1", children: ["$", user?.balance?.toFixed(2) ?? '0.00'] })] }), _jsxs("section", { className: "card p-5 space-y-3", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "text-xs uppercase tracking-widest text-white/60", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("input", { type: "number", min: 1, value: amount, onChange: (e) => setAmount(Number(e.target.value)), className: "w-full mt-1 px-4 py-3 rounded-xl bg-navy-800 border border-white/10 focus:border-cyber-cyan outline-none" })] }), _jsx("div", { className: "flex gap-2", children: [5, 10, 25, 50, 100].map((v) => (_jsxs("button", { className: "btn-ghost flex-1", onClick: () => setAmount(v), children: ["$", v] }, v))) }), _jsxs("div", { className: "grid grid-cols-2 gap-3 pt-2", children: [_jsx("button", { className: "btn-primary", onClick: deposit, disabled: busy, children: "\u041F\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "btn-secondary", onClick: withdraw, disabled: busy, children: "\u0412\u044B\u0432\u0435\u0441\u0442\u0438" })] }), _jsx("p", { className: "text-xs text-white/40", children: "Demo: deposit/withdraw \u2014 \u0437\u0430\u0433\u043B\u0443\u0448\u043A\u0438. \u0412 \u043F\u0440\u043E\u0434\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 Telegram\u00A0Stars \u0438\u043B\u0438 \u043A\u0440\u0438\u043F\u0442\u043E-\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440." })] }), _jsxs("section", { className: "card p-5", children: [_jsx("h3", { className: "font-display text-sm text-cyber-cyan tracking-widest mb-3", children: "\u0418\u0421\u0422\u041E\u0420\u0418\u042F \u041E\u041F\u0415\u0420\u0410\u0426\u0418\u0419" }), txs.length === 0 && _jsx("p", { className: "text-white/40 text-sm", children: "\u041F\u0443\u0441\u0442\u043E" }), _jsx("ul", { className: "space-y-1", children: txs.map((t) => (_jsxs("li", { className: "flex items-center justify-between text-sm py-1.5 border-b border-white/5", children: [_jsx("span", { className: "text-white/70", children: txLabel(t.type) }), _jsxs("span", { className: ['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type) ? 'text-sonar-400' : 'text-cyber-red', children: [['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type) ? '+' : '−', "$", Number(t.amount).toFixed(2)] })] }, t.id))) })] })] }));
}
function txLabel(t) {
    switch (t) {
        case 'DEPOSIT': return 'Пополнение';
        case 'WITHDRAW': return 'Вывод';
        case 'WAGER_LOCK': return 'Ставка';
        case 'WAGER_REFUND': return 'Возврат ставки';
        case 'PAYOUT': return 'Выигрыш';
        case 'RAKE': return 'Комиссия';
        default: return t;
    }
}
