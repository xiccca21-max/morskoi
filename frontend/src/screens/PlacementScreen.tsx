import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Board } from '../components/Board';
import { Ship } from '../components/Ship';
import {
  autoPlaceLocal,
  shipCells,
  ShipPlacement,
  SHIP_FLEET,
  validatePlacement,
} from '../lib/game-types';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgVerticalSwipes, tgMainButton, isTelegram } from '../lib/telegram';
import { toast as showToast } from '../stores/toast-store';
import { useMatchStore } from '../stores/match-store';
import { Icon } from '../components/Icon';
import { playSound } from '../lib/audio';

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
  const [deadline] = useState<number>(Date.now() + 30_000);
  const [now, setNow] = useState(Date.now());

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

  const selected = fleet.find((f) => f.id === selectedId) ?? fleet.find((f) => !f.placed) ?? null;

  const ghost = useMemo(() => {
    if (!selected || !hover) return { cells: [] as Array<[number, number]>, invalid: false };
    const cand: ShipPlacement = { id: selected.id, kind: selected.kind, size: selected.size, x: hover.x, y: hover.y, orientation };
    const cells = shipCells(cand);
    const others = placedShips.filter((s) => s.id !== selected.id);
    const v = validatePlacement([...others, cand]);
    return { cells, invalid: !v.ok };
  }, [selected?.id, hover?.x, hover?.y, orientation, placedShips]);

  const onCellClick = (x: number, y: number) => {
    // Тап по уже стоящему кораблю — «поднимаем» его, чтобы переставить.
    const onShip = fleet.find(
      (f) => f.placed && shipCells(f.placed).some(([cx, cy]) => cx === x && cy === y),
    );
    if (onShip && onShip.id !== selectedId) {
      setFleet((f) => f.map((it) => (it.id === onShip.id ? { ...it, placed: undefined } : it)));
      setSelectedId(onShip.id);
      tgHaptic('light');
      return;
    }

    if (!selected) return;
    const cand: ShipPlacement = { id: selected.id, kind: selected.kind, size: selected.size, x, y, orientation };
    const others = placedShips.filter((s) => s.id !== selected.id);
    if (!validatePlacement([...others, cand]).ok) { tgHaptic('error'); return; }
    setFleet((f) => f.map((it) => (it.id === selected.id ? { ...it, placed: cand } : it)));
    tgHaptic('light');
    playSound('place');
    const next = fleet.find((it) => it.id !== selected.id && !it.placed);
    setSelectedId(next?.id ?? null);
  };

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
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const fuse = Math.max(0, Math.min(100, (remaining / 30) * 100));

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
      text: allPlaced ? 'К бою' : `Осталось: ${fleet.length - placedShips.length}`,
      onClick: submit,
      active: allPlaced && !submitting,
      progress: submitting,
    });
  }, [useNative, allPlaced, submitting, sent, placedShips.length, fleet.length]); // eslint-disable-line

  return (
    <div className="max-w-md mx-auto space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="title text-main text-base">Расставь флот</h2>
        <span className={['text-xs font-display uppercase tracking-wider flex items-center gap-1.5', matchState?.opponentReady ? 'text-main' : 'text-muted'].join(' ')}>
          {matchState?.opponentReady ? <Icon name="check" size={14} /> : null}
          {matchState?.opponentReady ? 'соперник готов' : 'соперник готовится'}
        </span>
      </header>

      {/* Таймер */}
      <div className="h-1 rounded-full bg-panel overflow-hidden">
        <div className="h-full bg-danger transition-all" style={{ width: `${fuse}%` }} />
      </div>

      <Board
        mode="placement"
        ships={placedShips}
        ghostCells={ghost.cells}
        ghostInvalid={ghost.invalid}
        onCellClick={onCellClick}
        onCellEnter={(x, y) => setHover({ x, y })}
      />

      {/* Управление */}
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
          <Icon name="rotate" size={16} /> {orientation === 'H' ? 'Поперёк' : 'Вдоль'}
        </button>
        <button className="btn-secondary flex-1" onClick={autoPlace}><Icon name="dice" size={16} /> Авто</button>
        <button className="btn-ghost flex-1" onClick={reset}>Сброс</button>
      </div>

      <p className="text-center text-muted text-[11px]">
        Тапни по клетке, чтобы поставить · тапни по кораблю, чтобы передвинуть
      </p>

      {/* Верфь */}
      <div className="card p-3">
        <p className="eyebrow mb-2">Верфь · выбери корабль</p>
        <div className="grid grid-cols-2 gap-2">
          {fleet.map((s) => {
            const isSel = selected?.id === s.id && !s.placed;
            return (
              <button
                key={s.id}
                onClick={() => (s.placed ? removeShip(s.id) : setSelectedId(s.id))}
                className={[
                  'p-2 rounded-lg text-left border transition flex items-center gap-2',
                  s.placed ? 'border-line bg-base opacity-45' : 'border-line bg-panel',
                  isSel ? 'ring-1 ring-danger border-danger' : '',
                ].join(' ')}
              >
                <div className="h-5 flex-1" style={{ minWidth: s.size * 12 }}>
                  <Ship kind={s.kind} size={s.size} orientation="H" sunk={false} icon />
                </div>
                <div className="text-right">
                  <div className="text-xs text-main">{KIND_LABEL[s.kind]}</div>
                  <div className="eyebrow">{s.placed ? 'убрать' : `${s.size} кл.`}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {sent ? (
        <div className="card p-4 text-center text-main title text-sm flex items-center justify-center gap-2">
          <Icon name="check" size={16} /> Флот на позиции · ждём соперника
        </div>
      ) : !useNative ? (
        <motion.button className="btn-primary w-full" onClick={submit} disabled={!allPlaced || submitting} whileTap={{ scale: 0.98 }}>
          {submitting ? 'Отправка…' : allPlaced ? 'К бою' : `Осталось расставить: ${fleet.length - placedShips.length}`}
        </motion.button>
      ) : null}

      <p className="text-center text-muted text-xs tabular-nums">До автостановки: {remaining} c</p>
    </div>
  );
}
