import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { WalletAPI, Withdrawal } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic, tgOpenPayment, tgOpenLink, tgMainButton, isTelegram } from '../lib/telegram';
import { Icon } from '../components/Icon';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { VictoryBurst } from '../components/Effects';
import { Modal } from '../components/Modal';
import { toast } from '../stores/toast-store';
import { formatMoney, formatNumber, currencySymbol, currencyDecimals, rubToUnit, unitToRub, depositPresets } from '../lib/format';
import { playSound } from '../lib/audio';
import { useGameConfigStore } from '../stores/game-config-store';
import { useCurrencyStore } from '../stores/currency-store';
import {
  USDT_NETWORKS,
  validateUsdtAddress,
  formatWithdrawMethod,
  truncateAddress,
  type UsdtNetworkId,
} from '../lib/withdraw';

function shortId(id: string) { return id.slice(-8).toUpperCase(); }
function payId(txId: string) { return 'PAY-' + txId.slice(0, 8).toUpperCase(); }

// Менеджер ручного пополнения рублёвым переводом.
const RUB_MANAGER = 'Naval_pay_manager';

type DepositMethod = 'crypto' | 'rub';

const GAME_TYPES = new Set(['WAGER_LOCK', 'WAGER_REFUND', 'PAYOUT', 'RAKE']);

type Tab = 'deposit' | 'withdraw';

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
  PENDING: { label: 'В обработке', cls: 'text-warning border-warning/40' },
  APPROVED: { label: 'Одобрено', cls: 'text-main border-line/60' },
  PAID: { label: 'Выплачено', cls: 'text-success border-success/40' },
  REJECTED: { label: 'Отклонено', cls: 'text-danger border-danger/40' },
};

export default function WalletScreen() {
  const user = useAuthStore((s) => s.user);
  const minWithdraw = useGameConfigStore((s) => s.minWithdraw);
  const minDeposit = useGameConfigStore((s) => s.minDeposit);
  const maxDeposit = useGameConfigStore((s) => s.maxDeposit);
  const updateWallet = useAuthStore((s) => s.updateWallet);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  // Подписка на валюту/курсы — экран пересобирается при переключении валюты.
  useCurrencyStore((s) => s.currency);
  useCurrencyStore((s) => s.ratesVersion);

  const [tab, setTab] = useState<Tab>('deposit');
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('crypto');
  const [amount, setAmount] = useState(100);
  const [txs, setTxs] = useState<any[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [network, setNetwork] = useState<UsdtNetworkId>('TRC20');
  const [walletAddress, setWalletAddress] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');

  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

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
          playSound('win');
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 2200);
          WalletAPI.txs().then(setTxs).catch(() => {});
          setAwaitingPayment(false);
        }
      } catch { /* ignore */ }
      if (ticks >= 36) setAwaitingPayment(false); // ~3 мин (5с * 36)
    }, 5000);
    return () => clearInterval(t);
  }, [awaitingPayment, updateWallet]);

  const balance = user?.balance ?? 0;
  const withdrawable = user?.withdrawable ?? balance;

  const validDeposit = Number.isFinite(amount) && amount >= minDeposit && amount <= maxDeposit;
  const addressError = walletAddress.trim() ? validateUsdtAddress(network, walletAddress) : null;
  const validWithdraw = Number.isFinite(amount) && amount >= minWithdraw && amount <= withdrawable && !addressError && walletAddress.trim().length >= 10;

  const deposit = async () => {
    if (!validDeposit) { setError(`Сумма от ${formatMoney(minDeposit)} до ${formatMoney(maxDeposit)}`); return; }
    setError(null); setBusy(true);
    try {
      const r = await WalletAPI.deposit(amount);
      const payUrl = r.miniAppInvoiceUrl ?? r.invoiceUrl ?? r.botInvoiceUrl ?? r.payUrl;
      if (!payUrl) throw new Error('Нет ссылки на оплату');
      tgHaptic('success');
      tgOpenPayment(payUrl, (status) => {
        if (status === 'paid') {
          toast('Оплата получена — баланс пополнен', 'success', 'plus');
          refresh();
        } else if (status === 'failed') {
          toast('Оплата не прошла', 'error');
        }
      });
      toast(`Счёт на ${formatMoney(amount)} — оплатите в @CryptoBot`, 'info', 'coins');
      setAwaitingPayment(true);
    } catch (e: any) {
      tgHaptic('error'); setError(e?.response?.data?.message ?? e?.message ?? 'Не удалось пополнить');
    } finally { setBusy(false); }
  };

  const contactRubManager = () => {
    const a = Number.isFinite(amount) ? amount : 0;
    // Полный id — чтобы менеджер нашёл аккаунт точным поиском в админке.
    const fullId = user?.id ?? '';
    const msg =
      `Здравствуйте! Хочу пополнить баланс рублёвым переводом.\n` +
      `Сумма: ${a} ₽\n` +
      `Мой игровой ID: ${fullId}`;
    tgHaptic('medium');
    tgOpenLink(`https://t.me/${RUB_MANAGER}?text=${encodeURIComponent(msg)}`);
  };

  useEffect(() => {
    if (!isTelegram() || tab !== 'deposit' || showWithdraw) return;
    if (depositMethod === 'rub') {
      return tgMainButton({
        text: 'Написать менеджеру',
        onClick: contactRubManager,
        active: validDeposit,
        progress: false,
      });
    }
    return tgMainButton({
      text: validDeposit ? `Пополнить ${formatMoney(amount)}` : 'Пополнить',
      onClick: deposit,
      active: validDeposit && !busy && !awaitingPayment,
      progress: busy,
    });
  }, [tab, depositMethod, amount, validDeposit, busy, awaitingPayment, showWithdraw]); // eslint-disable-line

  const openWithdraw = () => {
    if (withdrawable < minWithdraw) {
      toast(`Минимум для вывода — ${formatMoney(minWithdraw)}. Доступно: ${formatMoney(withdrawable)}`, 'error', 'minus');
      return;
    }
    setAmount(Math.min(Math.max(minWithdraw, Math.floor(withdrawable)), Math.floor(withdrawable)));
    setWalletAddress('');
    setNetwork('TRC20');
    setConfirmWithdraw(false);
    setError(null);
    setShowWithdraw(true);
  };

  const submitWithdraw = async () => {
    if (!validWithdraw) {
      if (addressError) setError(addressError);
      else setError(`Сумма от ${formatMoney(minWithdraw)} до ${formatMoney(withdrawable)}`);
      return;
    }
    if (!confirmWithdraw) {
      setError('Подтвердите, что адрес кошелька указан верно');
      return;
    }
    setBusy(true); setError(null);
    try {
      await WalletAPI.withdraw(amount, network, walletAddress.trim());
      tgHaptic('success');
      toast('Заявка на вывод создана — обработка до 24 ч', 'success', 'minus');
      setShowWithdraw(false);
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
  const visibleTxs = filteredTxs.slice(0, visibleCount);
  const hasMore = filteredTxs.length > visibleCount;

  return (
    <div className="max-w-md mx-auto space-y-4">
      {returnTo && (
        <button
          type="button"
          className="card card-press p-3 w-full flex items-center gap-2 text-left border-danger"
          onClick={() => navigate(returnTo)}
        >
          <Icon name="arrow-right" size={16} className="rotate-180 text-danger shrink-0" />
          <span className="text-main text-sm">Вернуться к приглашению на бой</span>
        </button>
      )}
      <section
        className="relative overflow-hidden"
        style={{
          borderRadius: 'var(--radius-card)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 24px rgba(220,40,30,0.35)',
        }}
      >
        {celebrate && <VictoryBurst />}
        {/* Фон */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #c8201a 0%, #e83228 45%, #d42820 100%)' }} />
        {/* Сетка-узор */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Боковое свечение */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 15% 50%, rgba(255,255,255,0.12) 0%, transparent 70%)' }} />
        {/* Мерцающий блик */}
        <motion.div
          className="absolute inset-y-0 w-1/3 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
          animate={{ x: ['-150%', '400%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
        />
        {/* Содержимое */}
        <div className="relative px-6 pt-5 pb-5">
          {/* Лейбл */}
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-white/55 mb-3">Баланс</p>
          {/* Сумма: число + знак ₽ разделены чтобы шрифт был единым */}
          <div className="flex items-baseline gap-2 leading-none" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
            <span className="font-display text-[2.8rem] tabular-nums text-white font-normal leading-none">
              <AnimatedNumber value={balance} formatter={formatNumber} />
            </span>
            <span className="text-[1.6rem] text-white/80 font-normal leading-none" style={{ fontFamily: 'inherit' }}>₽</span>
          </div>
          <div className="mt-4 h-px w-14" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.4), transparent)' }} />
        </div>
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
          <p className="eyebrow">Способ пополнения</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => { setDepositMethod('crypto'); setError(null); }}
              className={['py-2.5 px-2 rounded-lg text-left transition border', depositMethod === 'crypto' ? 'bg-danger text-white border-danger' : 'bg-panel text-muted border-line hover:text-main'].join(' ')}
            >
              <div className="font-display text-xs">Криптовалюта</div>
              <div className={['text-[10px] mt-0.5', depositMethod === 'crypto' ? 'text-white/80' : 'text-muted'].join(' ')}>@CryptoBot · сразу</div>
            </button>
            <button
              onClick={() => { setDepositMethod('rub'); setError(null); }}
              className={['py-2.5 px-2 rounded-lg text-left transition border', depositMethod === 'rub' ? 'bg-danger text-white border-danger' : 'bg-panel text-muted border-line hover:text-main'].join(' ')}
            >
              <div className="font-display text-xs">Рубли</div>
              <div className={['text-[10px] mt-0.5', depositMethod === 'rub' ? 'text-white/80' : 'text-muted'].join(' ')}>Перевод · до 2 часов</div>
            </button>
          </div>

          <p className="eyebrow pt-1">Сумма пополнения ({currencySymbol()} на баланс)</p>
          <p className="text-muted text-xs leading-relaxed">
            {depositMethod === 'crypto'
              ? 'Оплата через @CryptoBot — платите криптой, баланс пополняется сразу.'
              : 'Пополнение рублёвым переводом через менеджера. Зачисление — до 2 часов.'}
          </p>
          <input
            type="number"
            min={rubToUnit(minDeposit)}
            max={rubToUnit(maxDeposit)}
            step={currencyDecimals() === 2 ? 0.01 : 1}
            value={Number.isFinite(amount) ? rubToUnit(amount) : ''}
            onChange={(e) => { setError(null); setAmount(unitToRub(Number(e.target.value))); }}
            className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-main outline-none tabular-nums"
          />
          <div className="flex gap-2">
            {depositPresets().map((p) => (
              <button
                key={p.rub}
                className={['flex-1 py-2.5 rounded-lg text-sm font-display tabular-nums transition border', amount === p.rub ? 'bg-danger text-white border-danger' : 'bg-panel text-main border-line'].join(' ')}
                onClick={() => { setError(null); setAmount(p.rub); }}
              >
                {p.unit}
              </button>
            ))}
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          {depositMethod === 'crypto' ? (
            <>
              <button className="btn-primary w-full" onClick={deposit} disabled={busy || !validDeposit || awaitingPayment}>
                <Icon name="plus" size={16} /> Пополнить {formatMoney(Number.isFinite(amount) ? amount : 0)}
              </button>
              {awaitingPayment && (
                <div className="flex items-center justify-center gap-2 text-muted text-xs">
                  <span className="w-3 h-3 rounded-full border-2 border-transparent border-t-danger animate-spin" />
                  Ждём подтверждения оплаты…
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
                <Icon name="info" size={15} className="text-warning shrink-0 mt-0.5" />
                <div className="text-[11px] text-main leading-relaxed space-y-1">
                  <p>Как пополнить рублями:</p>
                  <p>1. Нажми «Написать менеджеру» — откроется чат с готовым сообщением.</p>
                  <p>2. Менеджер пришлёт реквизиты для перевода.</p>
                  <p>3. После перевода баланс пополнится в течение <b>2 часов</b>.</p>
                </div>
              </div>
              <button className="btn-primary w-full" onClick={contactRubManager} disabled={!validDeposit}>
                <Icon name="share" size={16} /> Написать менеджеру
              </button>
              <p className="text-[10px] text-muted text-center">
                Менеджер: <span className="text-main">@{RUB_MANAGER}</span>
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Вывод средств</p>
            <span className="text-muted text-xs tabular-nums">Доступно: {formatMoney(withdrawable)}</span>
          </div>
          <div className="text-xs text-muted leading-relaxed space-y-1">
            <p>Вывод только в <b className="text-main">USDT</b> на ваш криптокошелёк.</p>
            <p>Минимум — <b className="text-main">{formatMoney(minWithdraw)}</b>.</p>
            <p>Обработка заявки — <b className="text-main">до 24 часов</b>.</p>
          </div>
          <button className="btn-primary w-full" onClick={openWithdraw} disabled={withdrawable < minWithdraw}>
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
                        <span className="text-main font-display tabular-nums">{formatMoney(w.net)}</span>
                        <span className={['text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5', st.cls].join(' ')}>
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <span className="text-muted text-[11px] truncate">
                          {formatWithdrawMethod(w.method)} · {truncateAddress(w.destination)}
                        </span>
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

      <Modal open={showWithdraw} onClose={() => setShowWithdraw(false)} title="Вывод USDT" icon="minus">
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
            <Icon name="info" size={15} className="text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-main leading-relaxed">
              Заявка обрабатывается вручную в течение <b>до 24 часов</b>.
              USDT отправляется на указанный адрес. Проверьте сеть и адрес — ошибочный перевод не возвращается.
            </p>
          </div>

          <div>
            <p className="eyebrow mb-1.5">Сеть USDT</p>
            <div className="grid grid-cols-2 gap-1.5">
              {USDT_NETWORKS.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { setNetwork(n.id); setError(null); }}
                  className={['py-2.5 px-2 rounded-lg text-left transition border', network === n.id ? 'bg-danger text-white border-danger' : 'bg-panel text-muted border-line hover:text-main'].join(' ')}
                >
                  <div className="font-display text-xs">{n.label}</div>
                  <div className={['text-[10px] mt-0.5', network === n.id ? 'text-white/80' : 'text-muted'].join(' ')}>{n.sub}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-1.5">
              {USDT_NETWORKS.find((n) => n.id === network)?.hint}
            </p>
          </div>

          <div>
            <p className="eyebrow mb-1.5">Адрес кошелька</p>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => { setError(null); setWalletAddress(e.target.value); setConfirmWithdraw(false); }}
              placeholder="Вставьте адрес USDT-кошелька"
              autoComplete="off"
              spellCheck={false}
              className={['w-full px-3 py-2.5 rounded-lg bg-panel border text-main outline-none text-sm font-mono', addressError && walletAddress.trim() ? 'border-danger' : 'border-line'].join(' ')}
            />
            {addressError && walletAddress.trim() && (
              <p className="text-danger text-[11px] mt-1">{addressError}</p>
            )}
          </div>

          <div>
            <p className="eyebrow mb-1.5">Сумма ({currencySymbol()})</p>
            <input
              type="number"
              min={rubToUnit(minWithdraw)}
              max={rubToUnit(Math.floor(withdrawable))}
              step={currencyDecimals() === 2 ? 0.01 : 1}
              value={Number.isFinite(amount) ? rubToUnit(amount) : ''}
              onChange={(e) => { setError(null); setAmount(unitToRub(Number(e.target.value))); }}
              className={['w-full px-3 py-2.5 rounded-lg bg-panel border text-main outline-none tabular-nums', validWithdraw || !amount ? 'border-line' : 'border-danger'].join(' ')}
            />
            <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums">
              <span>мин {formatMoney(minWithdraw)}</span>
              <button type="button" className="text-danger" onClick={() => setAmount(Math.floor(withdrawable))}>всё ({formatMoney(withdrawable)})</button>
            </div>
            <p className="text-[10px] text-muted mt-1">Эквивалент в USDT рассчитывается по курсу на момент выплаты.</p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none bg-panel rounded-lg p-3">
            <input
              type="checkbox"
              checked={confirmWithdraw}
              onChange={(e) => { setConfirmWithdraw(e.target.checked); setError(null); }}
              className="mt-0.5 w-4 h-4 accent-danger shrink-0"
            />
            <span className="text-[11px] text-muted leading-relaxed">
              Я проверил(а) адрес и сеть <b className="text-main">{network}</b>. Понимаю, что перевод на неверный адрес невозможно отменить.
            </span>
          </label>

          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="space-y-2 pt-1">
            <button className="btn-primary w-full" onClick={submitWithdraw} disabled={busy || !validWithdraw || !confirmWithdraw}>
              {busy ? 'Отправляем…' : `Вывести ${formatMoney(Number.isFinite(amount) ? amount : 0)} в USDT`}
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
                onClick={() => { setFilter(f); setVisibleCount(5); }}
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
          {visibleTxs.map((t) => {
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
                    {pending && <span className="text-[9px] uppercase tracking-wide text-warning border border-warning/40 rounded px-1 py-px">в обработке</span>}
                  </span>
                  <span className={['tabular-nums font-display text-sm', plus ? 'text-main' : 'text-danger'].join(' ')}>
                    {plus ? '+' : '−'}{formatMoney(Number(t.amount))}
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
        {hasMore && (
          <button
            className="w-full mt-3 text-sm text-danger font-display tracking-wide py-2 rounded-xl border border-danger/30 hover:bg-danger/5 transition"
            onClick={() => setVisibleCount(c => c + 5)}
          >
            Показать ещё
          </button>
        )}
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
