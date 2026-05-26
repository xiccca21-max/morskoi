import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { VictoryBurst } from '../components/Effects';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { GameAPI, WalletAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic } from '../lib/telegram';

export default function ResultScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const matchState = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);
  const me = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const applyMatchResult = useAuthStore((s) => s.applyMatchResult);
  const [waitingRematch, setWaitingRematch] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    GameAPI.state(matchId).then(setMatchState).catch(() => {});
    WalletAPI.balance().then((r) => updateBalance(r.balance)).catch(() => {});
  }, [matchId, setMatchState, updateBalance]);

  useEffect(() => {
    const sock = getSocket();
    const onRematch = (e: any) => {
      if (e.newMatchId) navigate(`/placement/${e.newMatchId}`);
    };
    sock.on('match:rematchStarted', onRematch);
    return () => { sock.off('match:rematchStarted', onRematch); };
  }, [navigate]);

  useEffect(() => {
    if (matchState?.winnerId && me?.id) {
      applyMatchResult(matchState.winnerId === me.id);
      tgHaptic(matchState.winnerId === me.id ? 'success' : 'error');
    }
  }, [matchState?.winnerId, me?.id]); // eslint-disable-line

  const won = matchState?.winnerId === me?.id;
  const draw = !matchState?.winnerId;

  const rematch = () => {
    if (!matchId) return;
    setWaitingRematch(true);
    getSocket().emit('match:rematch', { matchId, nonce: newNonce() }, (ack: any) => {
      if (!ack?.ok) { setWaitingRematch(false); alert(ack?.error); }
    });
  };

  const pool = matchState?.prizePool ?? 0;
  const rake = matchState?.rakeAmount ?? 0;
  const payout = +(pool - rake).toFixed(2);

  return (
    <div className="max-w-md mx-auto space-y-5 pt-6">
      <motion.section
        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="card p-8 text-center relative overflow-hidden"
      >
        {won && <VictoryBurst />}
        <p className="font-display tracking-[0.4em] text-xs text-white/50">{
          draw ? 'НИЧЬЯ' : won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'
        }</p>
        <p className="font-display text-5xl mt-2">
          {draw ? '🤝' : won ? '🏆' : '💀'}
        </p>
        {!draw && (
          <p className="font-display text-2xl mt-3 text-cyber-cyan">
            {won ? `+$${payout.toFixed(2)}` : `−$${matchState?.wagerAmount.toFixed(2) ?? ''}`}
          </p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Призовой" value={`$${pool.toFixed(2)}`} />
          <Stat label="Комиссия" value={`$${rake.toFixed(2)}`} />
          <Stat label="Выплата" value={won ? `$${payout.toFixed(2)}` : '—'} />
        </div>
      </motion.section>

      <div className="space-y-2">
        <button
          className="btn-primary w-full text-lg"
          onClick={rematch}
          disabled={waitingRematch}
        >
          {waitingRematch ? 'Ожидание соперника…' : '⚔ Реванш'}
        </button>
        <button className="btn-secondary w-full" onClick={() => navigate('/matchmaking')}>Новый бой</button>
        <button className="btn-ghost w-full" onClick={() => navigate('/home')}>На главную</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-navy-800/60 p-3">
      <div className="text-cyber-cyan font-display">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
