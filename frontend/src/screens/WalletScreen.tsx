import { useEffect, useState } from 'react';
import { WalletAPI, Withdrawal } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic, tgOpenLink } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Modal } from '../components/Modal';
import { toast } from '../stores/toast-store';

function shortId(id: string) { return id.slice(-8).toUpperCase(); }
function payId(txId: string) { return 'PAY-' + txId.slice(0, 8).toUpperCase(); }

const GAME_TYPES = new Set(['WAGER_LOCK', 'WAGER_REFUND', 'PAYOUT', 'RAKE']);

const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 100000;
const MIN_WITHDRAW = 100;

type Tab = 'deposit' | 'withdraw';

type Method = { id: string; label: string; icon: IconName; placeholder: string };
const METHODS: Method[] = [
  { id: 'CARD', label: 'Карта', icon: 'coins', placeholder: 'Номер карты' },
  { id: 'TON', label: 'TON', icon: 'wave', placeholder: 'Адрес TON-кошелька' },
  { id: 'CRYPTO', label: 'USDT', icon: 'coins', placeholder: 'Адрес кошелька (TRC-20)' },
];

function CopyId({ label, value }: { label: string; value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    toast(`ID скопирован`, 'info', 'check');
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-muted hover:text-main transition" title={value}>
      <span className="font-mono text-[10px]">{label}</span>
      <Icon name="check" size={10} />
    </button>
  );
}

const WD_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'В обработке', cls: 'text-amber-400 border-amber-400/40' },
  APPROVED: { label: 'Одобрено', cls: 'text-sky-400 border-sky-400/40' },
  PAID: { label: 'Выплачено', cls: 'text-success border-success/40' },
  REJECTED: { label: 'Отклонено', cls: 'text-danger border-danger/40' },
};

export default function WalletScreen() {
  const user = useAuthStore((s) => s.user);
  const updateWallet = useAuthStore((s) => s.updateWallet);

  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState(100);
  const [txs, setTxs] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [method, setMethod] = useState<string>('CARD');
  const [destination, setDestination] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');

  const [awaitingPayment, setAwaitingPayment] = useState(false);

  const refresh = () => {
    WalletAPI.txs().then(setTxs).catch(() => {});
    WalletAPI.withdrawals().then(setWithdrawals).catch(() => {});
    WalletAPI.balance().then(updateWallet).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  // После выставления крипто-счёта опрашиваем баланс ~3 минуты, ждём вебхук об оплате
  useEffect(() => {
    if (!awaitingPayment) return;
    const startBalance = useAuthStore.getState().user?.balance ?? 0;
    let ticks = 0;
    const t = setInterval(async () => {
      ticks++;
      try {
        const w = await WalletAPI.balance();
        updateWallet(w);
        if (w.balance > startBalance) {
          toast('Оплата получена — баланс пополнен', 'success', 'plus');
          tgHaptic('success');
          WalletAPI.txs().then(setTxs).catch(() => {});
          setAwaitingPayment(false);
        }
      } catch { /* ignore */ }
      if (ticks >= 36) setAwaitingPayment(false); // ~3 мин (5с * 36)
    }, 5000);
    return () => clearInterval(t);
  }, [awaitingPayment, updateWallet]);

  const balance = user?.balance ?? 0;
  const withdrawable = user?.withdrawable ?? 0;
  const bonus = Math.max(0, balance - withdrawable);

  const validDeposit = Number.isFinite(amount) && amount >= MIN_DEPOSIT && amount <= MAX_DEPOSIT;
  const validWithdraw = Number.isFinite(amount) && amount >= MIN_WITHDRAW && amount <= withdrawable;

  const deposit = async () => {
    if (!validDeposit) { setError(`Сумма от ${MIN_DEPOSIT} до ${MAX_DEPOSIT} ₽`); return; }
    setError(null); setBusy(true);
    try {
      const r = await WalletAPI.deposit(amount);
      tgHaptic('success');
      if (r.mode === 'cryptobot' && r.payUrl) {
        // Открываем счёт в @CryptoBot; зачисление придёт по вебхуку
        tgOpenLink(r.payUrl);
        toast('Счёт создан — оплатите в @CryptoBot', 'info', 'coins');
        setAwaitingPayment(true);
      } else {
        toast(`Баланс пополнен на ${amount} ₽`, 'success', 'plus');
      }
      refresh();
    } catch (e: any) {
      tgHaptic('error'); setError(e?.response?.data?.message ?? 'Не удалось пополнить');
    } finally { setBusy(false); }
  };

  const openWithdraw = () => {
    if (withdrawable < MIN_WITHDRAW) {
      toast(`Минимум для вывода — ${MIN_WITHDRAW} ₽. Доступно: ${withdrawable.toFixed(0)} ₽`, 'error', 'minus');
      return;
    }
    setAmount(Math.min(Math.max(MIN_WITHDRAW, Math.floor(withdrawable)), Math.floor(withdrawable)));
    setError(null);
    setShowWithdraw(true);
  };

  const submitWithdraw = async () => {
    if (!validWithdraw) { setError(`Сумма от ${MIN_WITHDRAW} до ${withdrawable.toFixed(0)} ₽`); return; }
    if (destination.trim().length < 4) { setError('Укажите реквизиты'); return; }
    setBusy(true); setError(null);
    try {
      await WalletAPI.withdraw(amount, method, destination.trim());
      tgHaptic('success');
      toast('Заявка на вывод создана', 'success', 'minus');
      setShowWithdraw(false);
      setDestination('');
      refresh();
    } catch (e: any) {
      tgHaptic('error'); setError(e?.response?.data?.message ?? 'Не удалось создать заявку');
    } finally { setBusy(false); }
  };

  const filteredTxs = txs.filter((t) => {
    if (filter === 'all') return true;
    const plus = ['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type);
    return filter === 'in' ? plus : !plus;
  });

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">Баланс</p>
            <p className="font-display text-4xl text-main mt-1 tabular-nums">
              <AnimatedNumber value={balance} formatter={(v) => v.toFixed(2)} /> ₽
            </p>
          </div>
          <Icon name="coins" size={32} className="text-muted" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-panel rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">Можно вывести</p>
            <p className="font-display text-main tabular-nums text-lg">{withdrawable.toFixed(0)} ₽</p>
          </div>
          <div className="bg-panel rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">Бонусы</p>
            <p className="font-display text-muted tabular-nums text-lg">{bonus.toFixed(0)} ₽</p>
          </div>
        </div>
        {bonus > 0 && (
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            Бонусные средства можно использовать в боях, но нельзя вывести. Выигрыши с бонусов выводятся.
          </p>
        )}
      </section>

      <section className="card p-1.5 flex gap-1.5">
        {(['deposit', 'withdraw'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            className={['flex-1 py-2.5 rounded-lg font-display text-sm transition', tab === t ? 'bg-danger text-white' : 'text-muted hover:text-main'].join(' ')}
          >
            {t === 'deposit' ? 'Пополнить' : 'Вывести'}
          </button>
        ))}
      </section>

      {tab === 'deposit' ? (
        <section className="card p-5 space-y-3">
          <p className="eyebrow">Сумма пополнения</p>
          <input
            type="number" min={MIN_DEPOSIT} max={MAX_DEPOSIT} value={Number.isFinite(amount) ? amount : ''}
            onChange={(e) => { setError(null); setAmount(Math.floor(Number(e.target.value))); }}
            className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-main outline-none tabular-nums"
          />
          <div className="flex gap-2">
            {[100, 500, 1000, 5000].map((v) => (
              <button key={v} className="btn-ghost flex-1 tabular-nums" onClick={() => { setError(null); setAmount(v); }}>{v}</button>
            ))}
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button className="btn-primary w-full" onClick={deposit} disabled={busy || !validDeposit}>
            <Icon name="plus" size={16} /> Пополнить на {Number.isFinite(amount) ? amount : 0} ₽
          </button>
          {awaitingPayment && (
            <div className="flex items-center justify-center gap-2 text-muted text-xs">
              <span className="w-3 h-3 rounded-full border-2 border-transparent border-t-danger animate-spin" />
              Ждём подтверждения оплаты…
            </div>
          )}
        </section>
      ) : (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Вывод средств</p>
            <span className="text-muted text-xs tabular-nums">Доступно: {withdrawable.toFixed(0)} ₽</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Минимальная сумма вывода — {MIN_WITHDRAW} ₽. Заявка обрабатывается до 24 часов.
            Выводятся только реальные средства (депозиты и выигрыши).
          </p>
          <button className="btn-primary w-full" onClick={openWithdraw} disabled={withdrawable < MIN_WITHDRAW}>
            <Icon name="minus" size={16} /> Создать заявку на вывод
          </button>

          {withdrawals.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="eyebrow">Мои заявки</p>
              <ul className="space-y-2">
                {withdrawals.map((w) => {
                  const st = WD_STATUS[w.status] ?? WD_STATUS.PENDING;
                  return (
                    <li key={w.id} className="bg-panel rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-main font-display tabular-nums">{w.net.toFixed(0)} ₽</span>
                        <span className={['text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5', st.cls].join(' ')}>
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted text-[11px]">{methodLabel(w.method)} · {new Date(w.createdAt).toLocaleDateString('ru-RU')}</span>
                        <CopyId label={`#${shortId(w.id)}`} value={w.id} />
                      </div>
                      {w.status === 'REJECTED' && w.note && (
                        <p className="text-danger text-[11px] mt-1">{w.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <Modal open={showWithdraw} onClose={() => setShowWithdraw(false)} title="Заявка на вывод" icon="minus">
        <div className="space-y-3">
          <div>
            <p className="eyebrow mb-1.5">Способ</p>
            <div className="grid grid-cols-3 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={['py-2 rounded-lg text-xs font-display transition flex flex-col items-center gap-1', method === m.id ? 'bg-danger text-white' : 'bg-panel text-muted'].join(' ')}
                >
                  <Icon name={m.icon} size={16} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Реквизиты</p>
            <input
              value={destination}
              onChange={(e) => { setError(null); setDestination(e.target.value); }}
              placeholder={METHODS.find((m) => m.id === method)?.placeholder}
              className="w-full px-3 py-2.5 rounded-lg bg-panel border border-line text-main outline-none text-sm"
            />
          </div>
          <div>
            <p className="eyebrow mb-1.5">Сумма</p>
            <input
              type="number" min={MIN_WITHDRAW} max={Math.floor(withdrawable)}
              value={Number.isFinite(amount) ? amount : ''}
              onChange={(e) => { setError(null); setAmount(Math.floor(Number(e.target.value))); }}
              className={['w-full px-3 py-2.5 rounded-lg bg-panel border text-main outline-none tabular-nums', validWithdraw ? 'border-line' : 'border-danger'].join(' ')}
            />
            <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums">
              <span>мин {MIN_WITHDRAW} ₽</span>
              <button className="text-danger" onClick={() => setAmount(Math.floor(withdrawable))}>всё ({withdrawable.toFixed(0)} ₽)</button>
            </div>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="space-y-2 pt-1">
            <button className="btn-primary w-full" onClick={submitWithdraw} disabled={busy || !validWithdraw || destination.trim().length < 4}>
              {busy ? 'Отправляем…' : `Вывести ${Number.isFinite(amount) ? amount : 0} ₽`}
            </button>
            <button className="btn-ghost w-full" onClick={() => setShowWithdraw(false)}>Отмена</button>
          </div>
        </div>
      </Modal>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">История операций</p>
          <div className="flex gap-1">
            {(['all', 'in', 'out'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={['text-[10px] uppercase tracking-wide px-2 py-1 rounded transition', filter === f ? 'bg-danger text-white' : 'text-muted'].join(' ')}
              >
                {f === 'all' ? 'Все' : f === 'in' ? 'Приход' : 'Расход'}
              </button>
            ))}
          </div>
        </div>
        {filteredTxs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Icon name="scroll" size={26} className="text-muted" />
            <p className="text-muted text-sm">Операций пока нет</p>
          </div>
        )}
        <ul className="divide-y divide-line">
          {filteredTxs.map((t) => {
            const plus = ['PAYOUT', 'DEPOSIT', 'WAGER_REFUND'].includes(t.type);
            const isGame = GAME_TYPES.has(t.type);
            const idLabel = isGame && t.matchId ? `#${shortId(t.matchId)}` : `#${payId(t.id)}`;
            const idFull = isGame && t.matchId ? t.matchId : t.id;
            const pending = t.status === 'PENDING';
            return (
              <li key={t.id} className="py-3 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-main text-sm flex items-center gap-1.5">
                    {txLabel(t.type)}
                    {pending && <span className="text-[9px] uppercase tracking-wide text-amber-400 border border-amber-400/40 rounded px-1 py-px">в обработке</span>}
                  </span>
                  <span className={['tabular-nums font-display text-sm', plus ? 'text-main' : 'text-danger'].join(' ')}>
                    {plus ? '+' : '−'}{Number(t.amount).toFixed(2)} ₽
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <CopyId label={idLabel} value={idFull} />
                  <span className="text-muted text-[10px] tabular-nums">
                    {new Date(t.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function methodLabel(m: string) {
  switch (m) {
    case 'CARD': return 'Карта';
    case 'TON': return 'TON';
    case 'CRYPTO': return 'USDT';
    default: return m;
  }
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
