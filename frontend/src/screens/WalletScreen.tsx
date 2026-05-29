import { useEffect, useState } from 'react';
import { WalletAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';
import { Icon } from '../components/Icon';
import { AnimatedNumber } from '../components/AnimatedNumber';

export default function WalletScreen() {
  const user = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const [amount, setAmount] = useState(50);
  const [txs, setTxs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { WalletAPI.txs().then(setTxs).catch(() => {}); }, []);

  const deposit = async () => {
    setBusy(true);
    try {
      const r = await WalletAPI.deposit(amount);
      updateBalance(r.balance); tgHaptic('success');
      WalletAPI.txs().then(setTxs);
    } finally { setBusy(false); }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      const r = await WalletAPI.withdraw(amount);
      updateBalance(r.balance); tgHaptic('success');
      WalletAPI.txs().then(setTxs);
    } catch (e: any) {
      tgHaptic('error'); alert(e?.response?.data?.message ?? e?.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Баланс</p>
          <p className="font-display text-4xl text-main mt-1 tabular-nums">
            <AnimatedNumber value={user?.balance ?? 0} formatter={(v) => v.toFixed(2)} /> ₽
          </p>
        </div>
        <Icon name="coins" size={32} className="text-muted" />
      </section>

      <section className="card p-5 space-y-3">
        <p className="eyebrow">Сумма</p>
        <input
          type="number" min={1} value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-main focus:border-line outline-none tabular-nums"
        />
        <div className="flex gap-2">
          {[10, 50, 100, 500].map((v) => (
            <button key={v} className="btn-ghost flex-1 tabular-nums" onClick={() => setAmount(v)}>{v}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button className="btn-primary" onClick={deposit} disabled={busy}><Icon name="plus" size={16} /> Пополнить</button>
          <button className="btn-secondary" onClick={withdraw} disabled={busy}><Icon name="minus" size={16} /> Вывести</button>
        </div>
        <p className="text-xs text-muted">
          Демо-режим: операции условны. В проде — Telegram Stars или крипто-провайдер.
        </p>
      </section>

      <section className="card p-5">
        <p className="eyebrow mb-3">История операций</p>
        {txs.length === 0 && <p className="text-muted text-sm">Пусто</p>}
        <ul className="divide-y divide-line">
          {txs.map((t) => {
            const plus = ['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type);
            return (
              <li key={t.id} className="flex items-center justify-between text-sm py-2.5">
                <span className="text-main">{txLabel(t.type)}</span>
                <span className={['tabular-nums font-display', plus ? 'text-main' : 'text-danger'].join(' ')}>
                  {plus ? '+' : '−'}{Number(t.amount).toFixed(2)} ₽
                </span>
              </li>
            );
          })}
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
