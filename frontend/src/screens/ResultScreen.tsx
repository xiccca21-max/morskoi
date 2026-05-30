import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { VictoryBurst } from '../components/Effects';
import { Ship } from '../components/Ship';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { GameAPI, WalletAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgShare, tgMainButton, isTelegram } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { playSound } from '../lib/audio';

export default function ResultScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const matchState = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);
  const clearMatch = useMatchStore((s) => s.clear);
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
    const onRematch = (e: any) => { if (e.newMatchId) navigate(`/placement/${e.newMatchId}`); };
    sock.on('match:rematchStarted', onRematch);
    return () => { sock.off('match:rematchStarted', onRematch); };
  }, [navigate]);

  const resultApplied = useRef(false);
  useEffect(() => {
    if (matchState?.winnerId && me?.id && matchState.matchId === matchId && !resultApplied.current) {
      resultApplied.current = true;
      const isWin = matchState.winnerId === me.id;
      applyMatchResult(isWin);
      tgHaptic(isWin ? 'success' : 'error');
      playSound(isWin ? 'win' : 'lose');
    }
  }, [matchState?.winnerId, me?.id, matchState?.matchId, matchId]); // eslint-disable-line

  const won = matchState?.winnerId === me?.id;
  const draw = !matchState?.winnerId;
  const useNative = isTelegram();

  const rematch = () => {
    if (!matchId) return;
    setWaitingRematch(true);
    getSocket().emit('match:rematch', { matchId, nonce: newNonce() }, (ack: any) => {
      if (!ack?.ok) { setWaitingRematch(false); }
    });
  };

  const shareResult = () => {
    const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    const payout = +(((matchState?.prizePool ?? 0) - (matchState?.rakeAmount ?? 0))).toFixed(0);
    tgShare(`https://t.me/${bot}`, `Только что выиграл ${payout} ₽ в морской дуэли! Сразись со мной 🚢`);
  };

  // Нативная кнопка Telegram = Реванш
  useEffect(() => {
    if (!useNative) return;
    return tgMainButton({
      text: waitingRematch ? 'Ждём соперника' : 'Реванш',
      onClick: rematch,
      progress: waitingRematch,
      active: !waitingRematch,
    });
  }, [useNative, waitingRematch]); // eslint-disable-line

  const pool = matchState?.prizePool ?? 0;
  const rake = matchState?.rakeAmount ?? 0;
  const payout = +(pool - rake).toFixed(2);

  if (!matchState || matchState.matchId !== matchId) {
    return (
      <div className="max-w-md mx-auto space-y-5 pt-6">
        <div className="card p-8 flex flex-col items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-12 w-full mt-2" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5 pt-6">
      <motion.section
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-8 text-center relative overflow-hidden"
      >
        {won && <VictoryBurst />}

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
          className={[
            'mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 border-4',
            won
              ? 'bg-success/10 text-success border-success'
              : draw
              ? 'bg-panel text-muted border-line'
              : 'bg-danger/10 text-danger border-danger',
          ].join(' ')}
        >
          <Icon name={(draw ? 'handshake' : won ? 'trophy' : 'skull') as IconName} size={36} />
        </motion.div>

        <p className={['font-display text-2xl tracking-wide', won ? 'text-success' : draw ? 'text-muted' : 'text-danger'].join(' ')}>
          {draw ? 'Ничья' : won ? 'Победа!' : 'Поражение'}
        </p>

        {!draw && (
          <p className={['font-display text-4xl mt-1 tabular-nums', won ? 'text-success' : 'text-danger'].join(' ')}>
            {won ? `+${payout.toFixed(0)}` : `−${matchState?.wagerAmount.toFixed(0) ?? ''}`} ₽
          </p>
        )}

        {/* Тонущий корабль при поражении */}
        {!won && !draw && (
          <div className="mx-auto w-24 mt-3 animate-sink"><Ship kind="cruiser" size={3} orientation="H" sunk /></div>
        )}

        <div className="rope my-5" />

        <div className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
          <Stat label="Банк" value={`${pool.toFixed(0)} ₽`} />
          <Stat label="Комиссия" value={`${rake.toFixed(0)} ₽`} />
          <Stat label="Добыча" value={won ? `${payout.toFixed(0)} ₽` : '—'} />
        </div>

        <div className="rope my-4" />
        <p className="text-muted text-xs">
          Баланс: <span className="font-display text-main tabular-nums">{(me?.balance ?? 0).toFixed(0)} ₽</span>
        </p>

        {matchId && (
          <p className="text-[10px] text-muted font-mono tracking-wide mt-3">
            Игра #{matchId.slice(-8).toUpperCase()}
          </p>
        )}
      </motion.section>

      <div className="space-y-2">
        {!useNative && (
          <button className="btn-primary w-full" onClick={rematch} disabled={waitingRematch}>
            {waitingRematch ? 'Ждём соперника…' : 'Реванш'}
          </button>
        )}
        <button className="btn-secondary w-full" onClick={() => { clearMatch(); navigate('/matchmaking'); }}>Новый бой</button>
        {won && (
          <button className="btn-ghost w-full" onClick={shareResult}><Icon name="share" size={16} /> Похвастаться</button>
        )}
        <button className="btn-ghost w-full" onClick={() => { clearMatch(); navigate('/home'); }}>На палубу</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel p-3">
      <div className="text-main font-display tabular-nums">{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}
