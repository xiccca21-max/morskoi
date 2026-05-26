import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Board } from '../components/Board';
import {
  autoPlaceLocal,
  BOARD_SIZE,
  shipCells,
  ShipPlacement,
  SHIP_FLEET,
  validatePlacement,
} from '../lib/game-types';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic } from '../lib/telegram';
import { useMatchStore } from '../stores/match-store';

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
    for (let n = 0; n < f.count; n++) {
      out.push({ id: `s_${i++}`, kind: f.kind, size: f.size });
    }
  }
  return out;
}

export default function PlacementScreen() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const matchState = useMatchStore((s) => s.state);

  const [fleet, setFleet] = useState<SlotShip[]>(initialFleet);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deadline, setDeadline] = useState<number>(Date.now() + 30_000);
  const [now, setNow] = useState(Date.now());

  const placedShips = useMemo(
    () => fleet.filter((f) => f.placed).map((f) => f.placed!) as ShipPlacement[],
    [fleet],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Запрашиваем состояние матча
    if (!matchId) return;
    getSocket().emit('match:requestState', { matchId }, (ack: any) => {
      if (ack?.state) {
        // если уже разместился — сразу даём знать
      }
    });
  }, [matchId]);

  // Авто-переход когда оба готовы
  useEffect(() => {
    if (matchState?.gameStatus === 'IN_PROGRESS' && matchId) {
      navigate(`/battle/${matchId}`);
    }
  }, [matchState?.gameStatus, matchId, navigate]);

  const selected = fleet.find((f) => f.id === selectedId) ?? fleet.find((f) => !f.placed) ?? null;

  const ghost = useMemo(() => {
    if (!selected || !hover) return { cells: [] as Array<[number, number]>, invalid: false };
    const cand: ShipPlacement = {
      id: selected.id,
      kind: selected.kind,
      size: selected.size,
      x: hover.x,
      y: hover.y,
      orientation,
    };
    const cells = shipCells(cand);
    const others = placedShips.filter((s) => s.id !== selected.id);
    const test = [...others, cand];
    const v = validatePlacement(test);
    return { cells, invalid: !v.ok };
  }, [selected?.id, hover?.x, hover?.y, orientation, placedShips]);

  const onCellClick = (x: number, y: number) => {
    if (!selected) return;
    const cand: ShipPlacement = {
      id: selected.id, kind: selected.kind, size: selected.size,
      x, y, orientation,
    };
    const others = placedShips.filter((s) => s.id !== selected.id);
    if (!validatePlacement([...others, cand]).ok) { tgHaptic('error'); return; }
    setFleet((f) => f.map((it) => (it.id === selected.id ? { ...it, placed: cand } : it)));
    tgHaptic('light');
    // выбираем следующий неустановленный
    const next = fleet.find((it) => it.id !== selected.id && !it.placed);
    setSelectedId(next?.id ?? null);
  };

  const removeShip = (id: string) => {
    setFleet((f) => f.map((it) => (it.id === id ? { ...it, placed: undefined } : it)));
    setSelectedId(id);
  };

  const autoPlace = () => {
    const ships = autoPlaceLocal();
    const next = fleet.map((slot, idx) => {
      const ship = ships[idx];
      return { ...slot, placed: ship ? { ...ship, id: slot.id, kind: slot.kind, size: slot.size } : undefined };
    });
    setFleet(next);
    tgHaptic('medium');
  };

  const reset = () => setFleet(initialFleet());

  const submit = async () => {
    if (placedShips.length !== fleet.length) return;
    const v = validatePlacement(placedShips);
    if (!v.ok) { alert(v.reason); return; }
    setSubmitting(true);
    getSocket().emit(
      'game:placement',
      { matchId, ships: placedShips, nonce: newNonce() },
      (ack: any) => {
        setSubmitting(false);
        if (!ack?.ok) { tgHaptic('error'); alert(ack?.error ?? 'Ошибка'); return; }
        tgHaptic('success');
        // ждём пока сервер запустит бой через сокет-стейт
      },
    );
  };

  const allPlaced = placedShips.length === fleet.length;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  return (
    <div className="max-w-md mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-cyber-cyan tracking-widest text-sm">РАССТАНОВКА</h2>
        <div className="text-sm">
          <span className="text-white/40">Соперник: </span>
          <span className={matchState?.opponentReady ? 'text-sonar-400' : 'text-cyber-gold'}>
            {matchState?.opponentReady ? '✓ готов' : '… ожидает'}
          </span>
        </div>
      </header>

      <Board
        mode="placement"
        ships={placedShips}
        ghostCells={ghost.cells}
        ghostInvalid={ghost.invalid}
        onCellClick={onCellClick}
        onCellEnter={(x, y) => setHover({ x, y })}
      />

      {/* Управление */}
      <div className="card p-3 flex items-center justify-between gap-2">
        <button className="btn-secondary flex-1" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
          🔄 {orientation === 'H' ? 'Горизонталь' : 'Вертикаль'}
        </button>
        <button className="btn-secondary flex-1" onClick={autoPlace}>🎲 Авто</button>
        <button className="btn-ghost flex-1" onClick={reset}>↺ Сброс</button>
      </div>

      {/* Корабли */}
      <div className="card p-3">
        <h3 className="text-xs uppercase tracking-widest text-white/60 mb-2">Флот</h3>
        <div className="grid grid-cols-2 gap-2">
          {fleet.map((s) => (
            <button
              key={s.id}
              onClick={() => (s.placed ? removeShip(s.id) : setSelectedId(s.id))}
              className={[
                'p-2 rounded-xl text-left border transition',
                s.placed ? 'border-sonar-400/40 bg-sonar-500/10' : 'border-white/10 bg-navy-800/60',
                selectedId === s.id && !s.placed ? 'ring-2 ring-cyber-cyan' : '',
              ].join(' ')}
            >
              <div className="flex gap-0.5 mb-1">
                {Array.from({ length: s.size }).map((_, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm bg-cyber-cyan/70" />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">{labelByKind(s.kind)}</span>
                <span className="text-xs text-white/40">{s.placed ? '✓' : 'выбрать'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <motion.button
        className="btn-primary w-full text-lg"
        onClick={submit}
        disabled={!allPlaced || submitting}
        whileTap={{ scale: 0.97 }}
      >
        {submitting ? 'Отправка…' : allPlaced ? '⚓ В БОЙ' : `Расставьте все корабли (${placedShips.length}/${fleet.length})`}
      </motion.button>

      <p className="text-center text-white/40 text-xs">⌛ {remaining}s</p>
    </div>
  );
}

function labelByKind(k: string) {
  switch (k) {
    case 'battleship': return 'Линкор (4)';
    case 'cruiser':    return 'Крейсер (3)';
    case 'destroyer':  return 'Эсминец (2)';
    case 'submarine':  return 'Подлодка (1)';
  }
  return k;
}
