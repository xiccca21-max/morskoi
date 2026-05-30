import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../components/Board';
import { Ship } from '../components/Ship';
import { Explosion, Splash } from '../components/Effects';
import { getSocket, newNonce } from '../api/socket';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic, tgNotify, tgVibrate, tgBackButton, tgClosingConfirmation, tgVerticalSwipes } from '../lib/telegram';
import { SHIP_FLEET, ShipKind } from '../lib/game-types';
import { Icon, IconName } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { playSound } from '../lib/audio';
import { toast } from '../stores/toast-store';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
const coord = (x: number, y: number) => `${LETTERS[x] ?? '?'}${y + 1}`;

// Полный флот (для трекера): по размеру, от большого к малому
const FULL_FLEET: { kind: ShipKind; size: number }[] = SHIP_FLEET.flatMap((f) =>
  Array.from({ length: f.count }, () => ({ kind: f.kind, size: f.size })),
).sort((a, b) => b.size - a.size);

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
  const [shake, setShake] = useState(false);
  const [view, setView] = useState<'enemy' | 'own'>('enemy');
  const [reactions, setReactions] = useState<Array<{ id: number; icon: IconName; isMine: boolean }>>([]);

  const [showSurrender, setShowSurrender] = useState(false);
  const [connected, setConnected] = useState(true);
  const [reactionCooldown, setReactionCooldown] = useState(false);

  useEffect(() => { if (matchId) getSocket().emit('match:requestState', { matchId }); }, [matchId]);

  // Отслеживаем соединение, чтобы показать оверлей переподключения
  useEffect(() => {
    const sock = getSocket();
    setConnected(sock.connected);
    const on = () => { setConnected(true); if (matchId) sock.emit('match:requestState', { matchId }); };
    const off = () => setConnected(false);
    sock.on('connect', on);
    sock.on('disconnect', off);
    return () => { sock.off('connect', on); sock.off('disconnect', off); };
  }, [matchId]);

  // Нативная кнопка «Назад» = попытка покинуть бой (с предупреждением);
  // блокируем случайный выход свайпом/закрытием во время боя.
  useEffect(() => {
    const cleanup = tgBackButton(true, () => setShowSurrender(true));
    tgClosingConfirmation(true);
    tgVerticalSwipes(false);
    return () => {
      cleanup();
      tgClosingConfirmation(false);
      tgVerticalSwipes(true);
    };
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!lastAttack) return;
    if (lastAttack.hit) {
      setExplosionKey((k) => k + 1);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      // Вибрация как при уведомлении: двойной импульс на попадание, длиннее — на потопление
      tgNotify(lastAttack.sunk ? 'error' : 'success');
      playSound('boom');
    } else {
      setSplashKey((k) => k + 1);
      tgHaptic('light');
      tgVibrate(35);
      playSound('splash');
    }
    // Если стрелял соперник — подсказываем, куда именно, и показываем наше поле
    if (lastAttack.by && me?.id && lastAttack.by !== me.id) {
      const where = coord(lastAttack.x, lastAttack.y);
      if (lastAttack.sunk) toast(`Соперник потопил ваш корабль (${where})`, 'error', 'skull');
      else if (lastAttack.hit) toast(`Попадание по вам: ${where}`, 'error', 'target');
      else toast(`Соперник промахнулся: ${where}`, 'info', 'wave');
      setView('own');
      const t = setTimeout(() => setView('enemy'), 1600);
      return () => clearTimeout(t);
    }
  }, [lastAttack?.ts]); // eslint-disable-line

  useEffect(() => {
    if (state?.gameStatus === 'FINISHED' && matchId) navigate(`/result/${matchId}`);
  }, [state?.gameStatus, matchId, navigate]);

  // Глобальный слушатель реакций
  useEffect(() => {
    const sock = getSocket();
    const onReaction = (data: any) => {
      playSound('click');
      setReactions((prev) => [...prev, { id: Date.now(), icon: data.reaction as IconName, isMine: data.by === me?.id }]);
      setTimeout(() => {
        setReactions((prev) => prev.slice(1));
      }, 3000);
    };
    sock.on('match:reaction', onReaction);
    return () => { sock.off('match:reaction', onReaction); };
  }, [me?.id]);

  // Авто-передача хода по таймауту
  useEffect(() => {
    const sock = getSocket();
    const onTimeout = (data: any) => {
      const timedOutMe = data.timedOut === me?.id;
      const missed = data.missed ?? 1;
      const max = 3; // AFK_FORFEIT_TIMEOUTS
      if (timedOutMe) {
        tgHaptic('error');
        toast(`Ход пропущен — ${missed} из ${max}. Ещё ${max - missed} — поражение`, 'error', 'skull');
      } else {
        toast('Соперник пропустил ход', 'info', 'clock');
      }
    };
    sock.on('match:turnTimeout', onTimeout);
    return () => { sock.off('match:turnTimeout', onTimeout); };
  }, [me?.id]);

  const myTurn = state?.currentTurn === me?.id;
  const deadline = state?.turnDeadline ? new Date(state.turnDeadline).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  // Масштаб полоски таймера определяем по фактической длительности хода,
  // а не по захардкоженным 20с (TURN_TIMEOUT_SEC может отличаться).
  const turnMaxRef = useRef(20);
  const lastDeadlineRef = useRef(0);
  if (deadline && deadline !== lastDeadlineRef.current) {
    lastDeadlineRef.current = deadline;
    const span = Math.ceil((deadline - Date.now()) / 1000);
    if (span > 0) turnMaxRef.current = span;
  }

  // Сигнал, когда наступает твой ход
  const prevTurnRef = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !prevTurnRef.current && state?.gameStatus === 'IN_PROGRESS') {
      playSound('turn');
      tgHaptic('light');
    }
    prevTurnRef.current = myTurn;
  }, [myTurn, state?.gameStatus]);
  const fuse = Math.max(0, Math.min(100, (remaining / turnMaxRef.current) * 100));

  const enemyAttacks = state?.enemy.view.attacks ?? [];
  const ownAttacks = state?.me.own.attacks ?? [];
  const ownShips = state?.me.own.ships ?? [];

  const enemySunkRaw = state?.enemy.view.sunkShips ?? [];
  const enemySunk = enemySunkRaw.length;
  const ownSunk = useMemo(() => ownShips.filter((s: any) => s.sunk).length, [ownShips]);

  // Преобразуем потопленные корабли врага ({id, kind, cells}) в формат для Board.
  const enemySunkShips = useMemo(() => {
    return enemySunkRaw.map((s: any) => {
      const cells: Array<[number, number]> = s.cells ?? [];
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const horizontal = ys.every((v) => v === ys[0]);
      const size = cells.length || 1;
      return {
        id: s.id,
        kind: s.kind,
        size,
        orientation: horizontal ? 'H' : 'V',
        x: minX,
        y: minY,
        hits: size,
        sunk: true,
      };
    });
  }, [enemySunkRaw]);

  // Лог последних выстрелов (мои по enemyAttacks)
  const myLog = useMemo(() => enemyAttacks.slice(-5).reverse(), [enemyAttacks]);

  const attack = (x: number, y: number) => {
    if (!matchId) return;
    if (!myTurn) { tgHaptic('warning'); return; }
    if (enemyAttacks.some((a) => a.x === x && a.y === y)) {
      tgHaptic('error');
      toast('Сюда уже стреляли', 'info', 'crosshair');
      return;
    }
    getSocket().emit('game:attack', { matchId, x, y, nonce: newNonce() });
  };

  const doSurrender = () => {
    if (!matchId) return;
    tgHaptic('warning');
    getSocket().emit('game:surrender', { matchId, nonce: newNonce() });
    setShowSurrender(false);
  };

  const sendReaction = (icon: IconName) => {
    if (!matchId || reactionCooldown) return;
    getSocket().emit('match:reaction', { matchId, reaction: icon, nonce: newNonce() });
    setReactionCooldown(true);
    setTimeout(() => setReactionCooldown(false), 1200);
  };

  if (!state) return <div className="card p-6 text-center text-muted max-w-md mx-auto">Выходим на позицию…</div>;

  return (
    <div className={['max-w-md mx-auto space-y-3', shake ? 'fx-shake' : ''].join(' ')}>
      {/* HUD */}
      <div className="card p-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Банк</p>
          <p className="font-display text-main text-lg leading-none tabular-nums">{state.prizePool.toFixed(0)} ₽</p>
          {matchId && <p className="text-[9px] text-muted font-mono mt-0.5">#{matchId.slice(-8).toUpperCase()}</p>}
        </div>
        <div className="text-center flex-1 px-3">
          <p className={['eyebrow flex items-center justify-center gap-1.5', myTurn ? 'text-main' : 'text-muted'].join(' ')}>
            {myTurn && (
              <motion.span
                className="inline-block w-1.5 h-1.5 rounded-full bg-danger"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {myTurn ? 'Твой залп' : 'Ход соперника'}
          </p>
          <div className="h-1 rounded-full bg-panel overflow-hidden mt-1.5">
            <div className={['h-full transition-all', myTurn ? 'bg-danger' : 'bg-muted'].join(' ')} style={{ width: `${fuse}%` }} />
          </div>
          <p className="font-display text-xl text-main mt-0.5 tabular-nums">{remaining}c</p>
        </div>
        <button
          onClick={() => setShowSurrender(true)}
          className="btn-ghost text-xs py-2 px-2.5 transition"
          title="Сдаться"
        >
          <Icon name="flag" size={16} />
        </button>
      </div>

      {/* Переключатель полей */}
      <div className="card p-1 flex gap-1">
        <SwitchBtn active={view === 'enemy'} onClick={() => setView('enemy')} icon="target">Атака</SwitchBtn>
        <SwitchBtn active={view === 'own'} onClick={() => setView('own')} icon="shield">Мой флот</SwitchBtn>
      </div>

      {/* Поле */}
      <div className="relative">
        {view === 'enemy' ? (
          <>
            <Board
              mode="enemy"
              ships={enemySunkShips as any}
              attacks={enemyAttacks}
              onCellClick={attack}
              onCellEnter={(x, y) => setHover({ x, y })}
              disabled={!myTurn}
              myTurn={myTurn}
              highlight={hover && myTurn ? hover : null}
            />
            <AnimatePresence>
              {lastAttack?.by === me?.id && lastAttack?.hit && <Explosion keyId={explosionKey} />}
              {lastAttack?.by === me?.id && lastAttack?.hit === false && <Splash keyId={splashKey} />}
            </AnimatePresence>
          </>
        ) : (
          <Board mode="own" ships={ownShips as any} attacks={ownAttacks} disabled />
        )}

        <AnimatePresence>
          {!connected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-[2px] rounded"
            >
              <span className="relative w-10 h-10">
                <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-danger animate-spin" />
              </span>
              <p className="text-white text-sm font-display">Переподключаемся…</p>
              <p className="text-white/70 text-xs">Бой сохранён, не закрывайте приложение</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Трекер вражеского флота */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="eyebrow">Флот врага</p>
          <span className="text-xs font-display text-danger tabular-nums">{enemySunk}/10 потоплено</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FULL_FLEET.map((s, i) => {
            const dead = i < enemySunk;
            return (
              <div
                key={i}
                className={['h-4 rounded-sm transition', dead ? 'opacity-30' : ''].join(' ')}
                style={{ width: s.size * 11 }}
                title={`${s.size} кл.`}
              >
                <Ship kind={s.kind} size={s.size} orientation="H" sunk={dead} icon />
              </div>
            );
          })}
        </div>
      </div>

      {/* Лог выстрелов */}
      {myLog.length > 0 && view === 'enemy' && (
        <div className="card p-3">
          <p className="eyebrow mb-2">Твои залпы</p>
          <ul className="space-y-1">
            {myLog.map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="font-display text-main tabular-nums">{coord(a.x, a.y)}</span>
                <span className={['flex items-center gap-1.5', a.hit ? 'text-danger' : 'text-muted'].join(' ')}>
                  {a.sunkShipId ? 'потоплен' : a.hit ? 'попадание' : 'мимо'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-muted">
        {myTurn ? 'Наведись на клетку врага и дай залп. Попал — стреляй снова.' : 'Ход соперника. Ожидайте.'}
      </motion.p>

      {/* Дразнилки (Реакции) */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <ReactionBtn icon="skull" disabled={reactionCooldown} onClick={() => sendReaction('skull')} />
        <ReactionBtn icon="crown" disabled={reactionCooldown} onClick={() => sendReaction('crown')} />
        <ReactionBtn icon="flag" disabled={reactionCooldown} onClick={() => sendReaction('flag')} />
        <ReactionBtn icon="wave" disabled={reactionCooldown} onClick={() => sendReaction('wave')} />
      </div>

      {/* Всплывающие анимации реакций поверх поля */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, scale: 0.5, y: 50, x: r.isMine ? -20 : 20 }}
              animate={{ opacity: 1, scale: 1, y: -100, x: r.isMine ? -50 : 50 }}
              exit={{ opacity: 0, scale: 1.5, y: -200 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className={['absolute bottom-1/3 text-4xl', r.isMine ? 'left-1/2 text-main' : 'right-1/2 text-danger'].join(' ')}
            >
              <Icon name={r.icon} size={48} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={showSurrender}
        title="Покинуть бой?"
        icon="flag"
        danger
        message={
          <>
            Если вы сдадитесь или выйдете, бой засчитывается сопернику.
            Ваша ставка <span className="text-danger font-display">{state.wagerAmount} ₽</span> сгорит без возврата.
          </>
        }
        confirmLabel="Сдаться"
        cancelLabel="Вернуться в бой"
        onConfirm={doSurrender}
        onCancel={() => setShowSurrender(false)}
      />
    </div>
  );
}

function ReactionBtn({ icon, onClick, disabled }: { icon: IconName; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-muted hover:text-main hover:border-main transition disabled:opacity-40 active:scale-90"
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

function SwitchBtn({ active, onClick, icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2 rounded-lg text-sm font-display uppercase tracking-wider transition flex items-center justify-center gap-2',
        active ? 'bg-panel text-main' : 'text-muted hover:text-main',
      ].join(' ')}
    >
      <Icon name={icon} size={16} /> {children}
    </button>
  );
}
