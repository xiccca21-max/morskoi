import { useEffect, useState } from 'react';
import { WalletAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';

export default function WalletScreen() {
  const user = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const [amount, setAmount] = useState(10);
  const [txs, setTxs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    WalletAPI.txs().then(setTxs).catch(() => {});
  }, []);

  const deposit = async () => {
    setBusy(true);
    try {
      const r = await WalletAPI.deposit(amount);
      updateBalance(r.balance);
      tgHaptic('success');
      WalletAPI.txs().then(setTxs);
    } finally { setBusy(false); }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      const r = await WalletAPI.withdraw(amount);
      updateBalance(r.balance);
      tgHaptic('success');
      WalletAPI.txs().then(setTxs);
    } catch (e: any) {
      tgHaptic('error');
      alert(e?.response?.data?.message ?? e?.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6 text-center">
        <p className="text-white/60 text-sm">Текущий баланс</p>
        <p className="font-display text-4xl text-cyber-cyan mt-1">${user?.balance?.toFixed(2) ?? '0.00'}</p>
      </section>

      <section className="card p-5 space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-white/60">Сумма</span>
          <input
            type="number" min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-navy-800 border border-white/10 focus:border-cyber-cyan outline-none"
          />
        </label>
        <div className="flex gap-2">
          {[5, 10, 25, 50, 100].map((v) => (
            <button key={v} className="btn-ghost flex-1" onClick={() => setAmount(v)}>
              ${v}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button className="btn-primary" onClick={deposit} disabled={busy}>Пополнить</button>
          <button className="btn-secondary" onClick={withdraw} disabled={busy}>Вывести</button>
        </div>
        <p className="text-xs text-white/40">
          Demo: deposit/withdraw — заглушки. В проде подключите Telegram&nbsp;Stars или крипто-провайдер.
        </p>
      </section>

      <section className="card p-5">
        <h3 className="font-display text-sm text-cyber-cyan tracking-widest mb-3">ИСТОРИЯ ОПЕРАЦИЙ</h3>
        {txs.length === 0 && <p className="text-white/40 text-sm">Пусто</p>}
        <ul className="space-y-1">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5">
              <span className="text-white/70">{txLabel(t.type)}</span>
              <span className={['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type) ? 'text-sonar-400' : 'text-cyber-red'}>
                {['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type) ? '+' : '−'}${Number(t.amount).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function txLabel(t: string) {
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
