import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../components/Board';
import { Explosion, Splash } from '../components/Effects';
import { getSocket, newNonce } from '../api/socket';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';

export default function BattleScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const state = useMatchStore((s) => s.state);
  const lastAttack = useMatchStore((s) => s.lastAttack);
  const me = useAuthStore((s) => s.user);

  const [now, setNow] = useState(Date.now());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [explosionKey, setExplosionKey] = useState(0);
  const [splashKey, setSplashKey] = useState(0);
  const [view, setView] = useState<'enemy' | 'own'>('enemy');

  // Запрос состояния при входе
  useEffect(() => {
    if (matchId) {
      getSocket().emit('match:requestState', { matchId });
    }
  }, [matchId]);

  // timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // hit/miss эффекты
  useEffect(() => {
    if (!lastAttack) return;
    if (lastAttack.hit) {
      setExplosionKey((k) => k + 1);
      tgHaptic(lastAttack.sunk ? 'error' : 'heavy');
    } else {
      setSplashKey((k) => k + 1);
      tgHaptic('light');
    }
  }, [lastAttack?.ts]); // eslint-disable-line

  // Переходы
  useEffect(() => {
    if (state?.gameStatus === 'FINISHED' && matchId) navigate(`/result/${matchId}`);
  }, [state?.gameStatus, matchId, navigate]);

  const myTurn = state?.currentTurn === me?.id;
  const deadline = state?.turnDeadline ? new Date(state.turnDeadline).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  const enemyAttacks = state?.enemy.view.attacks ?? [];
  const ownAttacks   = state?.me.own.attacks ?? [];
  const ownShips     = state?.me.own.ships ?? [];

  const enemySunk = useMemo(
    () => (state?.enemy.view.sunkShips ?? []).length,
    [state?.enemy.view.sunkShips],
  );
  const ownSunk = useMemo(
    () => ownShips.filter((s: any) => s.sunk).length,
    [ownShips],
  );

  const attack = (x: number, y: number) => {
    if (!myTurn || !matchId) return;
    if (enemyAttacks.some((a) => a.x === x && a.y === y)) return;
    getSocket().emit(
      'game:attack',
      { matchId, x, y, nonce: newNonce() },
      (_ack: any) => { /* event придёт через 'match:attack' */ },
    );
  };

  const surrender = () => {
    if (!matchId) return;
    if (!confirm('Сдаться? Соперник получит выигрыш.')) return;
    getSocket().emit('game:surrender', { matchId, nonce: newNonce() });
  };

  if (!state) {
    return (
      <div className="card p-6 text-center">
        Загрузка боя…
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* HUD */}
      <div className="card p-3 flex items-center justify-between">
        <div className="text-xs">
          <p className="text-white/40">Призовой фонд</p>
          <p className="font-display text-cyber-cyan">${state.prizePool.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <TurnIndicator myTurn={myTurn} remaining={remaining} />
        </div>
        <button onClick={surrender} className="btn-ghost text-xs py-1.5 px-3">Сдаться</button>
      </div>

      {/* Switch */}
      <div className="card p-1 flex">
        <button
          onClick={() => setView('enemy')}
          className={['flex-1 py-2 rounded-lg text-sm font-semibold', view === 'enemy' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' ')}
        >🎯 Атака</button>
        <button
          onClick={() => setView('own')}
          className={['flex-1 py-2 rounded-lg text-sm font-semibold', view === 'own' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' ')}
        >⚓ Мой флот</button>
      </div>

      {/* Board */}
      <div className="relative">
        {view === 'enemy' ? (
          <>
            <Board
              mode="enemy"
              attacks={enemyAttacks}
              onCellClick={attack}
              onCellEnter={(x, y) => setHover({ x, y })}
              disabled={!myTurn}
              myTurn={myTurn}
              highlight={hover && myTurn ? hover : null}
            />
            {/* hit/miss FX */}
            <AnimatePresence>
              {lastAttack?.hit && lastAttack.by === me?.id && <Explosion keyId={explosionKey} />}
              {lastAttack?.hit === false && lastAttack?.by === me?.id && <Splash keyId={splashKey} />}
            </AnimatePresence>
          </>
        ) : (
          <Board mode="own" ships={ownShips as any} attacks={ownAttacks} disabled />
        )}
      </div>

      {/* Скоры */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreCard title="Враг потоплено" value={enemySunk} max={10} accent="text-cyber-red" />
        <ScoreCard title="Своих потеряно" value={ownSunk} max={10} accent="text-cyber-gold" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="text-center text-sm text-white/60"
      >
        {myTurn
          ? 'Тапни по вражеской клетке для атаки. Попадание — ещё ход.'
          : 'Ход соперника. Жди…'}
      </motion.div>
    </div>
  );
}

function TurnIndicator({ myTurn, remaining }: { myTurn: boolean; remaining: number }) {
  return (
    <div>
      <p className="text-xs text-white/40">{myTurn ? 'Твой ход' : 'Ход соперника'}</p>
      <p className={['font-display text-2xl', myTurn ? 'text-sonar-400' : 'text-cyber-gold'].join(' ')}>
        {remaining}s
      </p>
    </div>
  );
}

function ScoreCard({ title, value, max, accent }: { title: string; value: number; max: number; accent: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="card p-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/60">{title}</span>
        <span className={accent}>{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
        <div className={`h-full ${accent === 'text-cyber-red' ? 'bg-cyber-red' : 'bg-cyber-gold'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
