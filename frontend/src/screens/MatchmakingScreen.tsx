import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { MatchmakingAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';

const PRESETS = [5, 10, 25, 50, 100];

export default function MatchmakingScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [wager, setWager] = useState(10);
  const [tab, setTab] = useState<'quick' | 'private'>('quick');
  const [searching, setSearching] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => { tgHaptic('success'); navigate(`/placement/${data.matchId}`); };
    sock.on('match:found', onFound);
    return () => { sock.off('match:found', onFound); };
  }, [navigate]);

  useEffect(() => {
    if (!searching) return;
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [searching]);

  const lowFunds = !user || user.balance < wager;

  const startQuick = () => {
    if (lowFunds) { setError('Недостаточно средств'); return; }
    setError(null); setSearching(true); tgHaptic('medium');
    getSocket().emit('mm:join', { wagerAmount: wager, nonce: newNonce() }, (ack: any) => {
      if (!ack?.ok) { setError(ack?.error ?? 'Ошибка'); setSearching(false); return; }
      if (ack.matched && ack.matchId) navigate(`/placement/${ack.matchId}`);
    });
  };

  const cancelSearch = async () => {
    try { getSocket().emit('mm:leave'); } catch {}
    await MatchmakingAPI.leave().catch(() => {});
    setSearching(false);
  };

  const createPrivate = async () => {
    if (lowFunds) { setError('Недостаточно средств'); return; }
    setError(null);
    try {
      const l = await MatchmakingAPI.createLobby(wager);
      tgHaptic('success');
      navigate(`/lobby/${l.code}`);
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
  };

  const joinPrivate = () => {
    if (!joinCode) return;
    setError(null);
    navigate(`/lobby/${joinCode.toUpperCase()}`);
  };

  if (searching) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-8 flex flex-col items-center gap-5">
          <div className="relative w-20 h-20">
            <span className="absolute inset-0 rounded-full border border-line" />
            <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-danger animate-spin" />
            <span className="absolute inset-0 flex items-center justify-center text-muted"><Icon name="compass" size={26} /></span>
          </div>
          <div className="text-center">
            <p className="title text-main">Поиск соперника</p>
            <p className="text-muted text-sm mt-1 tabular-nums">{elapsed} c · ставка {wager} ₽</p>
          </div>
          <button className="btn-secondary w-full" onClick={cancelSearch}>Отменить</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">Поиск боя</h2>

      <div className="card p-1 flex gap-1">
        <TabBtn active={tab === 'quick'} onClick={() => setTab('quick')} icon="bolt">Быстрый</TabBtn>
        <TabBtn active={tab === 'private'} onClick={() => setTab('private')} icon="lock">С другом</TabBtn>
      </div>

      <div className="card p-5">
        <p className="eyebrow mb-2">Ставка</p>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="font-display text-4xl text-main tabular-nums">{wager}</span>
          <span className="text-muted text-sm">₽ с каждого</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setWager(p)}
              className={[
                'py-2 rounded-lg text-sm font-display tabular-nums transition border',
                wager === p ? 'bg-main text-panel border-main' : 'bg-panel text-main border-line',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          type="range" min={5} max={200} step={5} value={wager}
          onChange={(e) => setWager(Number(e.target.value))}
          className="w-full accent-danger"
        />
        <PrizeBreakdown wager={wager} />
      </div>

      {error && <div className="card p-3 text-danger text-sm border-danger">{error}</div>}

      {lowFunds && (
        <button className="btn-secondary w-full" onClick={() => navigate('/wallet')}>
          <Icon name="coins" size={16} /> Пополнить баланс
        </button>
      )}

      {tab === 'quick' ? (
        <button className="btn-primary w-full" onClick={startQuick} disabled={lowFunds}>
          <Icon name="swords" size={18} /> Найти соперника
        </button>
      ) : (
        <div className="space-y-3">
          <div className="card p-5 space-y-3">
            <p className="eyebrow">Создать лобби</p>
            <p className="text-muted text-xs">Получите код и ссылку-приглашение для друга. Бой начнётся, как только он войдёт.</p>
            <button className="btn-primary w-full" onClick={createPrivate} disabled={lowFunds}>
              <Icon name="lock" size={16} /> Создать и пригласить
            </button>
          </div>

          <div className="card p-5 space-y-3">
            <p className="eyebrow">Ввести чужой код</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="КОД"
              maxLength={10}
              className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-center font-display tracking-[0.3em] text-main focus:border-line outline-none"
            />
            <button className="btn-primary w-full" onClick={joinPrivate} disabled={!joinCode}>Открыть лобби</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: IconName; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 rounded-lg text-sm font-display uppercase tracking-wider transition flex items-center justify-center gap-2',
        active ? 'bg-panel text-main' : 'text-muted hover:text-main',
      ].join(' ')}
    >
      <Icon name={icon} size={16} /> {children}
    </button>
  );
}

function PrizeBreakdown({ wager }: { wager: number }) {
  const pool = wager * 2;
  const rake = +(pool * 0.05).toFixed(2);
  const win = +(pool - rake).toFixed(2);
  return (
    <div className="mt-4 grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
      <Cell label="Банк" value={`${pool} ₽`} />
      <Cell label="Комиссия" value={`−${rake} ₽`} accent />
      <Cell label="Победителю" value={`${win} ₽`} />
    </div>
  );
}
function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-panel p-3 text-center">
      <div className={['font-display tabular-nums', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}
