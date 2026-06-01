import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Board } from '../components/Board';
import {
  autoPlaceLocal,
  shipCells,
  ShipPlacement,
  SHIP_FLEET,
  validatePlacement,
} from '../lib/game-types';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgVerticalSwipes, tgMainButton, tgBackButton, isTelegram } from '../lib/telegram';
import { toast as showToast } from '../stores/toast-store';
import { useMatchStore } from '../stores/match-store';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { playSound } from '../lib/audio';
import { VintageShip } from '../components/VintageShip';
import '../styles/placement-vintage.css';

interface SlotShip {
  id: string;
  kind: ShipPlacement['kind'];
  size: number;
  placed?: ShipPlacement;
}

function initialFleet(): SlotShip[] {
  const out: SlotShip[] = [];
  let i = 0;
  for (const f of SHIP_FLEET) {
    for (let n = 0; n < f.count; n++) out.push({ id: `s_${i++}`, kind: f.kind, size: f.size });
  }
  return out;
}

function shipWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'корабль';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'корабля';
  return 'кораблей';
}

const KIND_LABEL: Record<string, string> = {
  battleship: 'Линкор',
  cruiser: 'Крейсер',
  destroyer: 'Эсминец',
  submarine: 'Катер',
};

export default function PlacementScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const matchState = useMatchStore((s) => s.state);
  const skin = useAuthStore((s) => s.user?.equippedSkin) ?? 'classic';

  const [fleet, setFleet] = useState<SlotShip[]>(initialFleet);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showExit, setShowExit] = useState(false);

  const deadline = useMemo(() => {
    const fromState = matchState?.placementDeadline;
    if (fromState) return new Date(fromState).getTime();
    return Date.now() + 60_000;
  }, [matchState?.placementDeadline]);

  const totalSec = useMemo(() => {
    const end = matchState?.placementDeadline;
    const start = matchState?.placementStartedAt;
    if (end && start) {
      return Math.max(10, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    }
    return 60;
  }, [matchState?.placementDeadline, matchState?.placementStartedAt]);

  const placedShips = useMemo(
    () => fleet.filter((f) => f.placed).map((f) => f.placed!) as ShipPlacement[],
    [fleet],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Не закрывать аппку случайным свайпом во время расстановки
  useEffect(() => {
    tgVerticalSwipes(false);
    return () => tgVerticalSwipes(true);
  }, []);

  useEffect(() => {
    if (matchId) getSocket().emit('match:requestState', { matchId });
  }, [matchId]);

  useEffect(() => {
    if (matchState?.gameStatus === 'IN_PROGRESS' && matchId) navigate(`/battle/${matchId}`);
  }, [matchState?.gameStatus, matchId, navigate]);

  // Выход во время расстановки разрешён (бой ещё не начался, ставка не списана).
  // Нативная кнопка «Назад» открывает подтверждение выхода.
  useEffect(() => tgBackButton(true, () => setShowExit(true)), []);

  const leaveMatch = () => {
    setShowExit(false);
    if (matchId) getSocket().emit('game:surrender', { matchId, nonce: newNonce() });
    tgHaptic('warning');
    navigate('/home');
  };

  useEffect(() => {
    const sock = getSocket();
    const onCancelled = (data: any) => {
      if (data?.matchId !== matchId) return;
      showToast('Бой отменён — соперник вышел. Ставка не списана.', 'info', 'flag');
      tgHaptic('warning');
      navigate('/home');
    };
    sock.on('match:cancelled', onCancelled);
    return () => { sock.off('match:cancelled', onCancelled); };
  }, [navigate, matchId]);

  const selected = fleet.find((f) => f.id === selectedId) ?? fleet.find((f) => !f.placed) ?? null;
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const placeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ghost = useMemo(() => {
    if (!selected || !hover) return { cells: [] as Array<[number, number]>, invalid: false, ship: null as ShipPlacement | null };
    const cand: ShipPlacement = { id: selected.id, kind: selected.kind, size: selected.size, x: hover.x, y: hover.y, orientation };
    const cells = shipCells(cand);
    const others = placedShips.filter((s) => s.id !== selected.id);
    const v = validatePlacement([...others, cand]);
    return { cells, invalid: !v.ok, ship: cand };
  }, [selected?.id, selected?.kind, selected?.size, hover?.x, hover?.y, orientation, placedShips]);

  const placeAt = (x: number, y: number) => {
    if (!selected) return;
    const cand: ShipPlacement = { id: selected.id, kind: selected.kind, size: selected.size, x, y, orientation };
    const others = placedShips.filter((s) => s.id !== selected.id);
    if (!validatePlacement([...others, cand]).ok) {
      tgHaptic('error');
      showToast('Сюда нельзя — корабли не должны касаться', 'error', 'crosshair');
      return;
    }
    setFleet((f) => f.map((it) => (it.id === selected.id ? { ...it, placed: cand } : it)));
    tgHaptic('light');
    playSound('place');
    const next = fleet.find((it) => it.id !== selected.id && !it.placed);
    setSelectedId(next?.id ?? null);
  };

  const onCellClick = (x: number, y: number) => {
    // Тап по уже стоящему кораблю — «поднимаем» его, чтобы переставить.
    const onShip = fleet.find(
      (f) => f.placed && shipCells(f.placed).some(([cx, cy]) => cx === x && cy === y),
    );
    if (onShip && onShip.id !== selectedId) {
      if (placeTimerRef.current) clearTimeout(placeTimerRef.current);
      setFleet((f) => f.map((it) => (it.id === onShip.id ? { ...it, placed: undefined } : it)));
      setSelectedId(onShip.id);
      tgHaptic('light');
      return;
    }

    if (!selected) return;

    // Двойной тап по одной клетке — поворот (удобнее на телефоне).
    const prev = lastTapRef.current;
    if (prev && prev.x === x && prev.y === y && Date.now() - prev.t < 400) {
      if (placeTimerRef.current) clearTimeout(placeTimerRef.current);
      lastTapRef.current = null;
      setOrientation((o) => (o === 'H' ? 'V' : 'H'));
      tgHaptic('light');
      return;
    }
    lastTapRef.current = { x, y, t: Date.now() };

    if (placeTimerRef.current) clearTimeout(placeTimerRef.current);
    placeTimerRef.current = setTimeout(() => {
      placeTimerRef.current = null;
      placeAt(x, y);
    }, 280);
  };

  useEffect(() => () => {
    if (placeTimerRef.current) clearTimeout(placeTimerRef.current);
  }, []);

  const removeShip = (id: string) => {
    setFleet((f) => f.map((it) => (it.id === id ? { ...it, placed: undefined } : it)));
    setSelectedId(id);
    tgHaptic('light');
  };

  const autoPlace = () => {
    const ships = autoPlaceLocal();
    setFleet((f) => f.map((slot, idx) => {
      const ship = ships[idx];
      return { ...slot, placed: ship ? { ...ship, id: slot.id, kind: slot.kind, size: slot.size } : undefined };
    }));
    tgHaptic('medium');
  };

  const reset = () => { setFleet(initialFleet()); setSelectedId(null); };

  const submit = () => {
    if (placedShips.length !== fleet.length) return;
    const v = validatePlacement(placedShips);
    if (!v.ok) { tgHaptic('error'); return; }
    setSubmitting(true);
    getSocket().emit('game:placement', { matchId, ships: placedShips, nonce: newNonce() }, (ack: any) => {
      setSubmitting(false);
      if (!ack?.ok) {
        tgHaptic('error');
        showToast(ack?.error ?? 'Ошибка расстановки', 'error');
        return;
      }
      tgHaptic('success'); setSent(true);
    });
  };

  const allPlaced = placedShips.length === fleet.length;
  const left = fleet.length - placedShips.length;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const fuse = Math.max(0, Math.min(100, (remaining / totalSec) * 100));
  const lowTime = remaining <= 10;
  const timerText = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  // Автостановка: если время вышло и игрок не отправил флот —
  // ставим корабли автоматически и отправляем, чтобы не потерять матч.
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (remaining > 0 || sent || submitting || autoSubmittedRef.current || !matchId) return;
    autoSubmittedRef.current = true;
    const ships = autoPlaceLocal().map((sp, idx) => {
      const slot = fleet[idx];
      return { ...sp, id: slot.id, kind: slot.kind, size: slot.size };
    });
    showToast('Время вышло — флот расставлен автоматически', 'info', 'dice');
    tgHaptic('warning');
    setSubmitting(true);
    getSocket().emit('game:placement', { matchId, ships, nonce: newNonce() }, (ack: any) => {
      setSubmitting(false);
      if (ack?.ok) setSent(true);
    });
  }, [remaining, sent, submitting, matchId, fleet]);

  // Нативная нижняя кнопка Telegram дублирует CTA «К бою»
  const useNative = isTelegram();
  useEffect(() => {
    if (!useNative) return;
    if (sent) {
      return tgMainButton({ text: 'Ждём соперника', onClick: () => {}, active: false, progress: true });
    }
    return tgMainButton({
      text: allPlaced ? 'К бою' : `Расставьте ещё ${left} ${shipWord(left)}`,
      onClick: submit,
      active: allPlaced && !submitting,
      progress: submitting,
    });
  }, [useNative, allPlaced, submitting, sent, placedShips.length, fleet.length]); // eslint-disable-line

  return (
    <div className="max-w-md mx-auto space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setShowExit(true)}
            className="btn-ghost text-xs py-1.5 px-2 shrink-0"
            title="Выйти из боя"
          >
            <Icon name="logout" size={16} />
          </button>
          <div className="min-w-0">
            <h2 className="title text-main text-base truncate">Расставь флот</h2>
            <span className={['text-[10px] font-display uppercase tracking-wider flex items-center gap-1 mt-0.5', matchState?.opponentReady ? 'text-main' : 'text-muted'].join(' ')}>
              {matchState?.opponentReady ? <Icon name="check" size={12} /> : null}
              {matchState?.opponentReady ? 'соперник готов' : 'соперник готовится'}
            </span>
          </div>
        </div>
        <div className="placement-timer-box shrink-0">
          <div className="placement-timer-label">Время на расстановку</div>
          <div className={['placement-timer-digits text-right', lowTime ? 'is-low' : ''].join(' ')}>
            {timerText}
          </div>
          <div className="placement-timer-bar">
            <div className="placement-timer-fill" style={{ width: `${fuse}%` }} />
          </div>
        </div>
      </header>

      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="eyebrow">Верфь · выбери корабль</p>
          <span className="text-xs font-display tabular-nums text-muted">{placedShips.length}/{fleet.length}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {fleet.map((s) => {
            const isSel = selected?.id === s.id && !s.placed;
            return (
              <button
                key={s.id}
                onClick={() => (s.placed ? removeShip(s.id) : setSelectedId(s.id))}
                className={[
                  'shrink-0 min-w-[132px] p-2.5 rounded-lg text-left border transition flex flex-col gap-1.5',
                  s.placed ? 'border-line bg-base opacity-45' : 'border-line bg-panel',
                  isSel ? 'ring-2 ring-danger border-danger' : '',
                ].join(' ')}
              >
                <div className="h-6 w-full">
                  <VintageShip kind={s.kind} size={s.size} orientation="H" icon />
                </div>
                <div>
                  <div className="text-xs text-main font-display">{KIND_LABEL[s.kind]}</div>
                  <div className="eyebrow">{s.placed ? 'убрать' : `${s.size} кл.`}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Board
        mode="placement"
        skin={skin}
        ships={placedShips}
        ghostCells={ghost.cells}
        ghostShip={ghost.ship}
        ghostInvalid={ghost.invalid}
        onCellClick={onCellClick}
        onCellEnter={(x, y) => setHover({ x, y })}
        highlight={hover}
      />

      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
          <Icon name="rotate" size={16} /> {orientation === 'H' ? 'Поперёк' : 'Вдоль'}
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={autoPlace}><Icon name="dice" size={16} /> Авто</button>
        <button type="button" className="btn-ghost flex-1" onClick={reset}>Сброс</button>
      </div>

      <div className="placement-rules-panel">
        <div className="placement-rules-title">Правила</div>
        <ul className="placement-rules-list">
          <li>Корабли ставятся только горизонтально или вертикально</li>
          <li>Между кораблями — минимум 1 клетка (не касаться)</li>
          <li>Двойной тап по клетке — повернуть корабль</li>
          <li>Тап по своему кораблю — поднять и переставить</li>
        </ul>
      </div>

      <div className="placement-hint-box">
        <Icon name="compass" size={14} className="shrink-0 mt-0.5 opacity-70" />
        <span>
          <strong>Подсказка:</strong>{' '}
          выбери корабль в верфи → наведи на поле → тап, чтобы поставить.
        </span>
      </div>

      {sent ? (
        <div className="card p-4 text-center text-main title text-sm flex items-center justify-center gap-2">
          <Icon name="check" size={16} /> Флот на позиции · ждём соперника
        </div>
      ) : !useNative ? (
        <motion.button className="btn-primary w-full" onClick={submit} disabled={!allPlaced || submitting} whileTap={{ scale: 0.98 }}>
          {submitting ? 'Отправка…' : allPlaced ? 'К бою' : `Расставьте ещё ${left} ${shipWord(left)}`}
        </motion.button>
      ) : null}

      <ConfirmDialog
        open={showExit}
        title="Выйти из боя?"
        icon="logout"
        danger
        message={
          <>
            Сейчас идёт расстановка — бой ещё не начался, поэтому
            ставка <span className="text-main font-display">не спишется</span>.
            Матч будет отменён для обоих игроков. После начала боя выйти без поражения уже нельзя.
          </>
        }
        confirmLabel="Выйти"
        cancelLabel="Остаться"
        onConfirm={leaveMatch}
        onCancel={() => setShowExit(false)}
      />
    </div>
  );
}
