import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI, UsersAPI } from '../api/endpoints';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/Modal';
import { getRank } from '../lib/rank';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore } from '../stores/settings-store';
import { useGameConfigStore } from '../stores/game-config-store';
import { useMoney, currencySymbol, rubToUnit, unitToRub, wagerPresetsRub } from '../lib/format';
import { tgHaptic, tgVibrate } from '../lib/telegram';

/** Экран принятия вызова по deep-link challenge_<id>. */
export default function ChallengeScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const fmt = useMoney();
  const sym = currencySymbol();
  const minWager = useGameConfigStore((s) => s.minWager);
  const maxWager = useGameConfigStore((s) => s.maxWager);
  const lastWager = useSettingsStore((s) => s.lastWager);
  const setLastWager = useSettingsStore((s) => s.setLastWager);
  const presets = useMemo(() => wagerPresetsRub(minWager, maxWager), [minWager, maxWager]);

  const [opponent, setOpponent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rawInput, setRawInput] = useState(String(rubToUnit(Math.max(minWager, lastWager))));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = me?.balance ?? 0;
  const effectiveMax = Math.max(maxWager, balance);
  const wager = Math.max(minWager, Math.min(effectiveMax, unitToRub(Number(rawInput) || rubToUnit(minWager))));
  const overBalance = wager > balance;

  const setWager = (rub: number) => {
    const clamped = Math.max(minWager, Math.min(effectiveMax, Math.round(rub)));
    setRawInput(String(rubToUnit(clamped)));
    setLastWager(clamped);
  };

  useEffect(() => {
    if (!id) return;
    if (id === me?.id) { navigate('/matchmaking', { replace: true }); return; }
    UsersAPI.byId(id)
      .then(setOpponent)
      .catch(() => setOpponent(null))
      .finally(() => setLoading(false));
  }, [id, me?.id, navigate]);

  const start = async () => {
    if (!id) return;
    if (overBalance) { tgVibrate(60); setError('Ставка превышает баланс'); return; }
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const lobby = await MatchmakingAPI.challenge(id, wager);
      tgHaptic('success');
      navigate(`/lobby/${lobby.code}`);
    } catch (e: any) {
      setBusy(false);
      setError(e?.response?.data?.message ?? e?.message ?? 'Не удалось создать вызов');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto space-y-4 pt-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!opponent) {
    return (
      <div className="max-w-md mx-auto card p-6 text-center space-y-3">
        <Icon name="user" size={32} className="text-muted mx-auto" />
        <p className="text-main">Соперник не найден</p>
        <button className="btn-ghost w-full" onClick={() => navigate('/home')}>На главную</button>
      </div>
    );
  }

  const name = opponent.username || 'Капитан';
  const rank = getRank(opponent.wins ?? 0);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6 text-center">
        <p className="eyebrow mb-3">Тебя вызывают на бой</p>
        <Avatar name={name} src={opponent.avatar} size={72} className="mx-auto" />
        <h2 className="font-display text-xl text-main mt-3">{name}</h2>
        <div className="flex items-center justify-center gap-1.5 text-muted mt-1">
          <Icon name={rank.icon} size={16} />
          <span className="title text-xs">{rank.title} · {opponent.wins ?? 0}W / {opponent.losses ?? 0}L</span>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Ставка боя</p>
          {overBalance && <span className="text-danger text-[11px] font-display">Превышает баланс</span>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            className="shrink-0 w-12 h-12 rounded-2xl bg-panel border-2 border-line flex items-center justify-center text-main transition active:scale-95 disabled:opacity-30"
            onClick={() => setWager(wager - 25)}
            disabled={wager <= minWager}
            aria-label="-25"
          >
            <Icon name="minus" size={24} />
          </button>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <input
              type="number"
              inputMode="decimal"
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                const n = Number(e.target.value);
                if (!isNaN(n) && n > 0) setLastWager(unitToRub(n));
              }}
              onBlur={() => setWager(unitToRub(Number(rawInput) || rubToUnit(minWager)))}
              className={['w-28 text-center bg-transparent outline-none font-display text-4xl tabular-nums', overBalance ? 'text-danger' : 'text-main'].join(' ')}
            />
            <span className={['text-sm shrink-0', overBalance ? 'text-danger' : 'text-muted'].join(' ')}>{sym}</span>
          </div>
          <button
            className="shrink-0 w-12 h-12 rounded-2xl bg-danger flex items-center justify-center text-white transition active:scale-95 disabled:opacity-30"
            onClick={() => setWager(wager + 25)}
            disabled={wager >= maxWager}
            aria-label="+25"
          >
            <Icon name="plus" size={24} />
          </button>
        </div>

        {presets.length > 0 && (
          <div className={`grid gap-1.5 ${presets.length <= 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
            {presets.map((p) => (
              <button key={p} onClick={() => setWager(p)}
                className={['py-2 rounded-lg text-xs font-display tabular-nums transition border', wager === p ? 'bg-main text-panel border-main' : 'bg-panel text-main border-line'].join(' ')}>
                {fmt(p)}
              </button>
            ))}
          </div>
        )}

        <div className="text-[11px] text-muted text-center tabular-nums">Баланс: {fmt(balance)}</div>

        {error && <div className="text-danger text-sm text-center">{error}</div>}

        {overBalance ? (
          <button className="btn-ghost w-full" onClick={() => navigate('/wallet')}>
            <Icon name="coins" size={16} /> Пополнить баланс
          </button>
        ) : (
          <button className="btn-primary w-full" onClick={() => { tgHaptic('light'); setConfirm(true); }} disabled={busy}>
            <Icon name="swords" size={16} /> Принять вызов за {fmt(wager)}
          </button>
        )}
        <button className="btn-ghost w-full" onClick={() => navigate('/home')}>Позже</button>
      </section>

      <ConfirmDialog
        open={confirm}
        title="Принять вызов?"
        icon="swords"
        message={
          <>
            Бой против <strong>{name}</strong>. Ставка <strong>{fmt(wager)}</strong> спишется
            при старте боя (когда оба расставят флот). Соперник получит уведомление.
            <span className="block mt-2 text-warning">
              ⚠️ Нужен стабильный интернет: при потере связи и пропуске ходов
              можно проиграть бой и потерять ставку.
            </span>
          </>
        }
        confirmLabel="Да, в бой"
        cancelLabel="Отмена"
        onConfirm={start}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
