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
    <div className="placement-vintage max-w-lg mx-auto space-y-3">
      {/* Шапка */}
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <button
              onClick={() => setShowExit(true)}
              className="placement-vintage__shield mt-0.5"
              title="Выйти"
              type="button"
            >
              <Icon name="anchor" size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="placement-vintage__stripe shrink-0" />
                <h1 className="placement-vintage__header-title truncate">Расставь свой флот</h1>
                <span className="placement-vintage__stripe shrink-0" />
              </div>
              <p className="text-[10px] uppercase tracking-wider mt-1 opacity-75 leading-snug">
                Размещай корабли на поле. Готовься к бою!
              </p>
            </div>
          </div>
          <div className="placement-vintage__timer-box shrink-0">
            <div className="placement-vintage__timer-label">Время на расстановку</div>
            <div className={['placement-vintage__timer-digits text-right', lowTime ? 'text-[var(--pv-red)]' : ''].join(' ')}>
              {timerText}
            </div>
            <div className="placement-vintage__timer-bar">
              <div className="placement-vintage__timer-fill" style={{ width: `${fuse}%` }} />
            </div>
          </div>
        </div>
        <p className={['text-[10px] uppercase tracking-wide text-center', matchState?.opponentReady ? 'opacity-90' : 'opacity-55'].join(' ')}>
          {matchState?.opponentReady ? '✓ Соперник готов' : 'Соперник расставляет флот…'}
        </p>
      </header>

      <Board
        mode="placement"
        aesthetic="vintage"
        ships={placedShips}
        ghostCells={ghost.cells}
        ghostShip={ghost.ship}
        ghostInvalid={ghost.invalid}
        onCellClick={onCellClick}
        onCellEnter={(x, y) => setHover({ x, y })}
        highlight={hover}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Твой флот */}
        <div className="placement-vintage__panel">
          <div className="placement-vintage__panel-title">Твой флот</div>
          <div>
            {fleet.map((s) => {
              const isSel = selected?.id === s.id && !s.placed;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (s.placed ? removeShip(s.id) : setSelectedId(s.id))}
                  className={[
                    'placement-vintage__fleet-item w-full text-left',
                    s.placed ? 'is-placed' : '',
                    isSel ? 'is-selected' : '',
                  ].join(' ')}
                >
                  <div className="placement-vintage__fleet-thumb">
                    <VintageShip kind={s.kind} size={s.size} orientation="H" icon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-display uppercase tracking-wide">{KIND_LABEL[s.kind]}</div>
                    <div className="text-[10px] opacity-70">{s.size} клет · ×1</div>
                  </div>
                  <div className="text-[10px] font-display uppercase shrink-0">
                    {s.placed ? 'убрать' : isSel ? '→' : ''}
                  </div>
                </button>
              );
            })}
          </div>
          {!allPlaced && (
            <div className="placement-vintage__status-box mx-2 mb-2">
              Все корабли должны быть размещены
            </div>
          )}
        </div>

        {/* Правила */}
        <div className="placement-vintage__panel">
          <div className="placement-vintage__panel-title">Правила</div>
          <ul className="placement-vintage__rules p-2.5 list-none m-0">
            <li>Корабли ставятся только горизонтально или вертикально</li>
            <li>Между кораблями — минимум 1 клетка (не касаться)</li>
            <li>Двойной тап по клетке — повернуть корабль</li>
            <li>Тап по своему кораблю — поднять и переставить</li>
          </ul>
        </div>
      </div>

      <div className="placement-vintage__hint flex gap-2 items-start">
        <Icon name="compass" size={14} className="shrink-0 mt-0.5 opacity-70" />
        <span>
          <strong className="uppercase text-[10px] tracking-wide">Подсказка:</strong>{' '}
          выбери корабль слева → наведи на поле → тап, чтобы поставить.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="placement-vintage__btn-outline" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
          <Icon name="rotate" size={14} /> {orientation === 'H' ? 'Вдоль' : 'Поперёк'}
        </button>
        <button type="button" className="placement-vintage__btn-outline col-span-1" onClick={autoPlace}>
          <Icon name="dice" size={14} /> Авто
        </button>
        <button type="button" className="placement-vintage__btn-outline" onClick={reset}>
          Сброс
        </button>
      </div>

      {sent ? (
        <div className="placement-vintage__panel p-4 text-center font-display uppercase tracking-wide text-sm flex items-center justify-center gap-2">
          <Icon name="check" size={16} /> Флот на позиции · ждём соперника
        </div>
      ) : !useNative ? (
        <motion.button
          type="button"
          className="placement-vintage__btn-red"
          onClick={submit}
          disabled={!allPlaced || submitting}
          whileTap={{ scale: 0.99 }}
        >
          {submitting ? 'Отправка…' : allPlaced ? 'К бою!' : `Ещё ${left} ${shipWord(left)}`}
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
