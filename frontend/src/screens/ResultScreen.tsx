import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { VictoryBurst } from '../components/Effects';
import { Ship } from '../components/Ship';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { GameAPI, MatchmakingAPI, UsersAPI, WalletAPI } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgShare, tgMainButton, isTelegram } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { playSound } from '../lib/audio';
import { formatMoney } from '../lib/format';
import { toast } from '../stores/toast-store';
import { ACHIEVEMENTS, newAchievementIds, statsFromUser, newStreakAchievements } from '../lib/achievements';
import { referralBotLink } from '../lib/referral';
import { getRank } from '../lib/rank';

const REMATCH_WAIT_MS = 120_000;

export default function ResultScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const matchState = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);
  const clearMatch = useMatchStore((s) => s.clear);
  const me = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const patchUser = useAuthStore((s) => s.patchUser);
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [rematchOffer, setRematchOffer] = useState(false);
  const rematchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!matchId) return;
    GameAPI.state(matchId).then(setMatchState).catch(() => {});
    WalletAPI.balance().then((r) => updateBalance(r.balance)).catch(() => {});
  }, [matchId, setMatchState, updateBalance]);

  useEffect(() => {
    const sock = getSocket();
    const onRematch = (e: any) => { if (e.newMatchId) navigate(`/placement/${e.newMatchId}`); };
    const onRematchReq = (e: any) => {
      if (e?.by === me?.id) return;
      setRematchOffer(true);
      toast('Соперник ждёт реванша', 'info', 'swords');
    };
    sock.on('match:rematchStarted', onRematch);
    sock.on('match:rematchRequested', onRematchReq);
    return () => {
      sock.off('match:rematchStarted', onRematch);
      sock.off('match:rematchRequested', onRematchReq);
    };
  }, [navigate, me?.id]);

  useEffect(() => () => {
    if (rematchTimer.current) clearTimeout(rematchTimer.current);
  }, []);

  const resultApplied = useRef(false);
  const achievementsShown = useRef(false);
  useEffect(() => {
    if (!matchState?.winnerId || !me?.id || matchState.matchId !== matchId || matchState.isTraining) return;
    const storageKey = `naval_result_${matchId}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');

    const before = statsFromUser(me);
    UsersAPI.me()
      .then((fresh) => {
        patchUser(fresh);
        const after = statsFromUser(fresh);
        if (!achievementsShown.current) {
          achievementsShown.current = true;
          for (const a of newAchievementIds(before, after)) {
            toast(`Достижение: ${a.title}`, 'success', a.icon);
          }
          for (const a of newStreakAchievements(before.loginStreak ?? 0, after.loginStreak ?? 0)) {
            toast(`Достижение: ${a.title}`, 'success', a.icon);
          }
        }
      })
      .catch(() => undefined);

    const isWin = matchState.winnerId === me.id;
    tgHaptic(isWin ? 'success' : 'error');
    playSound(isWin ? 'win' : 'lose');
  }, [matchState?.winnerId, me?.id, matchState?.matchId, matchId, patchUser]); // eslint-disable-line

  const won = matchState?.winnerId === me?.id;
  const draw = !matchState?.winnerId;
  const isTraining = !!matchState?.isTraining;
  const useNative = isTelegram();
  const rankedUp = !isTraining && !!(won && me && getRank(me.wins).title !== getRank(Math.max(0, me.wins - 1)).title);
  const newRank = me ? getRank(me.wins) : null;
  const canAffordRematch = !isTraining && (me?.balance ?? 0) >= (matchState?.wagerAmount ?? 0);

  const inviteTraining = async () => {
    try {
      tgHaptic('medium');
      const lobby = await MatchmakingAPI.createTrainingLobby();
      navigate(`/lobby/${lobby.code}`);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? e?.message ?? 'Не удалось создать тренировку', 'error');
    }
  };

  const rematch = () => {
    if (!matchId) return;
    if (!canAffordRematch) {
      toast('Недостаточно средств для реванша', 'error', 'coins');
      return;
    }
    setWaitingRematch(true);
    setRematchOffer(false);
    if (rematchTimer.current) clearTimeout(rematchTimer.current);
    rematchTimer.current = setTimeout(() => {
      setWaitingRematch(false);
      toast('Время ожидания реванша истекло', 'info');
    }, REMATCH_WAIT_MS);
    getSocket().emit('match:rematch', { matchId, nonce: newNonce() }, (ack: any) => {
      if (!ack?.ok) {
        setWaitingRematch(false);
        if (rematchTimer.current) clearTimeout(rematchTimer.current);
        toast(ack?.error ?? 'Не удалось запросить реванш', 'error');
        return;
      }
      if (ack.newMatchId) navigate(`/placement/${ack.newMatchId}`);
    });
  };

  const shareResult = () => {
    const payout = +(((matchState?.prizePool ?? 0) - (matchState?.rakeAmount ?? 0))).toFixed(0);
    const link = me ? referralBotLink(me.id) : `https://t.me/${import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot'}`;
    tgShare(link, `Только что выиграл ${payout} ₽ в морской дуэли! Сразись со мной 🚢`);
  };

  useEffect(() => {
    if (!useNative || isTraining) return;
    return tgMainButton({
      text: waitingRematch ? 'Ждём соперника' : rematchOffer ? 'Принять реванш' : 'Реванш',
      onClick: rematch,
      progress: waitingRematch,
      active: !waitingRematch && canAffordRematch,
    });
  }, [useNative, isTraining, waitingRematch, rematchOffer, canAffordRematch]); // eslint-disable-line

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
      {rematchOffer && !waitingRematch && !isTraining && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="card p-3 border-danger flex items-center gap-3">
          <Icon name="swords" size={18} className="text-danger shrink-0" />
          <p className="flex-1 text-sm text-main">Соперник предлагает реванш</p>
          <button className="btn-primary px-4 py-2 text-xs" onClick={rematch}>Принять</button>
        </motion.div>
      )}

      <motion.section
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-8 text-center relative overflow-hidden"
      >
        {/* Тематическое свечение фона: золото победы / багровый сумрак поражения */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            background: won
              ? 'radial-gradient(ellipse 80% 60% at 50% 22%, rgba(46,196,96,0.20), transparent 65%)'
              : draw
              ? 'radial-gradient(ellipse 80% 60% at 50% 22%, rgba(120,150,190,0.12), transparent 65%)'
              : 'radial-gradient(ellipse 80% 60% at 50% 22%, rgba(232,50,40,0.16), transparent 65%)',
          }}
        />
        {won && <VictoryBurst />}

        <div className="relative">
        {/* Пульсирующая аура вокруг иконки результата */}
        <div className="relative mx-auto w-20 h-20 mb-4">
          {!draw && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: won
                  ? '0 0 40px rgba(46,196,96,0.5)'
                  : '0 0 40px rgba(232,50,40,0.45)',
              }}
              animate={{ opacity: [0.45, 0.9, 0.45], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
            className={[
              'relative w-20 h-20 rounded-full flex items-center justify-center border-4',
              won
                ? 'bg-success/10 text-success border-success'
                : draw
                ? 'bg-panel text-muted border-line'
                : 'bg-danger/10 text-danger border-danger',
            ].join(' ')}
          >
            <Icon name={(draw ? 'handshake' : won ? 'trophy' : 'skull') as IconName} size={36} />
          </motion.div>
        </div>

        <p className={['font-display text-2xl tracking-[0.16em] uppercase', won ? 'text-success' : draw ? 'text-muted' : 'text-danger'].join(' ')}>
          {draw ? 'Ничья' : won ? 'Победа!' : 'Поражение'}
        </p>

        {isTraining && (
          <p className="text-muted text-sm mt-2">Тренировка · статистика и баланс не меняются</p>
        )}

        {!draw && !isTraining && (
          <motion.p
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.25 }}
            className={['font-display text-4xl mt-1 tnum', won ? 'text-success' : 'text-danger'].join(' ')}
            style={{ textShadow: won ? '0 0 24px rgba(46,196,96,0.4)' : '0 0 24px rgba(232,50,40,0.35)' }}
          >
            {won ? '+' : '−'}
            <AnimatedNumber
              value={won ? payout : (matchState?.wagerAmount ?? 0)}
              formatter={formatMoney}
            />
          </motion.p>
        )}

        {rankedUp && newRank && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.5 }}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-warning/15 border border-warning/50 px-4 py-1.5"
          >
            <motion.span
              animate={{ rotate: [0, -12, 12, 0] }}
              transition={{ duration: 0.8, repeat: 2, delay: 0.6 }}
              className="text-warning"
            >
              <Icon name={newRank.icon} size={16} />
            </motion.span>
            <span className="font-display text-warning text-sm">
              Новое звание: {newRank.title}!
            </span>
          </motion.div>
        )}

        {!won && !draw && (
          <div className="mx-auto w-28 mt-3 overflow-hidden" style={{ height: '40px' }}>
            <div className="animate-sink">
              <Ship kind="cruiser" size={3} orientation="H" sunk />
            </div>
          </div>
        )}

        <div className="rope my-5" />

        {!isTraining && (
          <>
            <div className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
              <Stat label="Банк" value={formatMoney(pool)} />
              <Stat label="Комиссия" value={formatMoney(rake)} />
              <Stat label="Добыча" value={won ? formatMoney(payout) : '—'} />
            </div>

            <div className="rope my-4" />
            <p className="text-muted text-xs">
              Баланс: <span className="font-display text-main tabular-nums">{formatMoney(me?.balance ?? 0)}</span>
            </p>
          </>
        )}

        {matchId && (
          <p className="text-[10px] text-muted font-mono tracking-wide mt-3">
            Игра #{matchId.slice(-8).toUpperCase()}
          </p>
        )}
        </div>
      </motion.section>

      <div className="space-y-2">
        {isTraining ? (
          <>
            <button className="btn-primary w-full" onClick={inviteTraining}>Пригласить друга</button>
            <button className="btn-secondary w-full" onClick={() => { clearMatch(); navigate('/matchmaking?quick=1'); }}>
              Играть на ставку
            </button>
          </>
        ) : (
          <>
            {!useNative && (
              <button className="btn-primary w-full" onClick={rematch} disabled={waitingRematch || !canAffordRematch}>
                {waitingRematch ? 'Ждём соперника…' : rematchOffer ? 'Принять реванш' : 'Реванш'}
              </button>
            )}
            {!canAffordRematch && (
              <p className="text-center text-xs text-warning">Нужно {formatMoney(matchState.wagerAmount)} ₽ для реванша</p>
            )}
            <button className="btn-secondary w-full" onClick={() => { clearMatch(); navigate('/matchmaking?quick=1'); }}>Новый бой</button>
            {won && (
              <button className="btn-ghost w-full" onClick={shareResult}><Icon name="share" size={16} /> Поделиться победой</button>
            )}
          </>
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
