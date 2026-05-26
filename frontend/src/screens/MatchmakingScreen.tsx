import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { MatchmakingAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgShare } from '../lib/telegram';

const PRESETS = [1, 5, 10, 25, 50];

export default function MatchmakingScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [wager, setWager] = useState(5);
  const [tab, setTab] = useState<'quick' | 'private'>('quick');
  const [searching, setSearching] = useState(false);
  const [lobbyCode, setLobbyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => {
      tgHaptic('success');
      navigate(`/placement/${data.matchId}`);
    };
    sock.on('match:found', onFound);
    return () => {
      sock.off('match:found', onFound);
    };
  }, [navigate]);

  useEffect(() => {
    if (!searching) return;
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [searching]);

  const startQuick = async () => {
    if (!user || user.balance < wager) { setError('Недостаточно средств'); return; }
    setError(null);
    setSearching(true);
    tgHaptic('medium');
    try {
      const sock = getSocket();
      sock.emit('mm:join', { wagerAmount: wager, nonce: newNonce() }, (ack: any) => {
        if (!ack?.ok) { setError(ack?.error ?? 'Ошибка'); setSearching(false); return; }
        if (ack.matched && ack.matchId) navigate(`/placement/${ack.matchId}`);
      });
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка');
      setSearching(false);
    }
  };

  const cancelSearch = async () => {
    try { getSocket().emit('mm:leave'); } catch {}
    await MatchmakingAPI.leave().catch(() => {});
    setSearching(false);
  };

  const createPrivate = async () => {
    if (!user || user.balance < wager) { setError('Недостаточно средств'); return; }
    setError(null);
    try {
      const l = await MatchmakingAPI.createLobby(wager);
      setLobbyCode(l.code);
      tgHaptic('success');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message);
    }
  };

  const joinPrivate = async () => {
    if (!joinCode) return;
    setError(null);
    try {
      const sock = getSocket();
      sock.emit('lobby:join', { code: joinCode.toUpperCase(), nonce: newNonce() }, (ack: any) => {
        if (!ack?.ok) { setError(ack?.error ?? 'Ошибка'); return; }
        navigate(`/placement/${ack.matchId}`);
      });
    } catch (e: any) {
      setError(e?.message);
    }
  };

  const shareInvite = () => {
    if (!lobbyCode) return;
    const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    const url = `https://t.me/${botUser}?startapp=lobby_${lobbyCode}`;
    tgShare(url, `⚓ Вызов на дуэль в Naval Clash! Ставка $${wager}. Код: ${lobbyCode}`);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="font-display text-cyber-cyan tracking-widest text-sm">ПОИСК БОЯ</h2>

      <div className="card p-1 flex">
        <TabBtn active={tab === 'quick'}   onClick={() => setTab('quick')}>⚡ Быстрая</TabBtn>
        <TabBtn active={tab === 'private'} onClick={() => setTab('private')}>🔒 Приватная</TabBtn>
      </div>

      {/* Wager picker */}
      <div className="card p-5">
        <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Ставка</label>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display text-3xl text-cyber-cyan">${wager}</span>
          <span className="text-white/40 text-sm">за матч</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setWager(p)}
              className={[
                'py-2 rounded-lg text-sm font-semibold transition',
                wager === p ? 'bg-cyber-cyan text-navy-950' : 'bg-navy-800 text-white/80',
              ].join(' ')}
            >
              ${p}
            </button>
          ))}
        </div>
        <input
          type="range" min={1} max={100} step={1} value={wager}
          onChange={(e) => setWager(Number(e.target.value))}
          className="w-full accent-cyber-cyan"
        />
        <div className="flex justify-between text-xs text-white/40 mt-1">
          <span>$1</span><span>$100</span>
        </div>
        <PrizeBreakdown wager={wager} />
      </div>

      {error && <div className="card p-3 text-cyber-red text-sm">{error}</div>}

      {tab === 'quick' && (
        <>
          {!searching ? (
            <button className="btn-primary w-full text-lg" onClick={startQuick}>
              ⚔ Найти соперника
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="card p-6 flex flex-col items-center gap-3"
            >
              <SonarSearchAnimation />
              <p className="font-display text-cyber-cyan tracking-widest">ПОИСК СОПЕРНИКА…</p>
              <p className="text-white/60">{elapsed}s · ставка ${wager}</p>
              <button className="btn-danger mt-2" onClick={cancelSearch}>Отменить</button>
            </motion.div>
          )}
        </>
      )}

      {tab === 'private' && (
        <div className="space-y-3">
          <div className="card p-5 space-y-3">
            <h3 className="font-display text-cyber-cyan text-sm tracking-widest">СОЗДАТЬ ЛОББИ</h3>
            {!lobbyCode ? (
              <button className="btn-primary w-full" onClick={createPrivate}>Создать инвайт</button>
            ) : (
              <div className="text-center space-y-2">
                <p className="text-white/60 text-xs">Код приглашения:</p>
                <p className="font-display text-4xl tracking-[0.3em] text-cyber-cyan">{lobbyCode}</p>
                <button className="btn-secondary w-full" onClick={shareInvite}>📨 Поделиться</button>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-display text-cyber-cyan text-sm tracking-widest">ВВЕСТИ КОД</h3>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              maxLength={10}
              className="w-full px-4 py-3 rounded-xl bg-navy-800 border border-white/10 text-center font-display tracking-[0.3em] focus:border-cyber-cyan outline-none"
            />
            <button className="btn-primary w-full" onClick={joinPrivate} disabled={!joinCode}>
              Войти в лобби
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 rounded-xl text-sm font-semibold transition',
        active ? 'bg-cyber-cyan text-navy-950' : 'text-white/70',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function PrizeBreakdown({ wager }: { wager: number }) {
  const pool = wager * 2;
  const rake = +(pool * 0.05).toFixed(2);
  const win = +(pool - rake).toFixed(2);
  return (
    <div className="mt-4 rounded-xl bg-navy-800/60 p-3 text-sm grid grid-cols-3 gap-2 text-center">
      <div><div className="text-white/40 text-xs">Призовой</div><div className="text-white">${pool}</div></div>
      <div><div className="text-white/40 text-xs">Комиссия 5%</div><div className="text-cyber-red">−${rake}</div></div>
      <div><div className="text-white/40 text-xs">Победителю</div><div className="text-sonar-400">${win}</div></div>
    </div>
  );
}

function SonarSearchAnimation() {
  return (
    <div className="relative w-40 h-40 rounded-full border-2 border-cyber-cyan/50 flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, transparent 70%, rgba(34,211,238,0.4) 88%, transparent 100%)',
          animation: 'radarSweep 2s linear infinite',
        }}
      />
      <span className="absolute inset-6 rounded-full border border-cyber-cyan/40" />
      <span className="absolute inset-12 rounded-full border border-cyber-cyan/30" />
      <span className="font-display text-3xl">⚓</span>
    </div>
  );
}
