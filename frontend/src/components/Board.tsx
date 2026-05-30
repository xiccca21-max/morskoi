import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AttackCell, BOARD_SIZE, ShipPlacement } from '../lib/game-types';
import { Ship } from './Ship';
import { Smoke } from './Effects';

type Mode = 'own' | 'enemy' | 'placement';

interface BoardProps {
  mode: Mode;
  ships?: ShipPlacement[];
  attacks?: AttackCell[];
  ghostCells?: Array<[number, number]>;
  ghostInvalid?: boolean;
  onCellClick?: (x: number, y: number) => void;
  onCellEnter?: (x: number, y: number) => void;
  disabled?: boolean;
  myTurn?: boolean;
  highlight?: { x: number; y: number } | null;
}

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

export function Board({
  mode,
  ships = [],
  attacks = [],
  ghostCells = [],
  ghostInvalid = false,
  onCellClick,
  onCellEnter,
  disabled = false,
  myTurn = true,
  highlight = null,
}: BoardProps) {
  const attackMap = useMemo(() => {
    const m = new Map<string, AttackCell>();
    for (const a of attacks) m.set(`${a.x}:${a.y}`, a);
    return m;
  }, [attacks]);

  const ghostSet = useMemo(
    () => new Set(ghostCells.map(([x, y]) => `${x}:${y}`)),
    [ghostCells],
  );

  // Клетки, занятые потопленными кораблями — на них рисуем обломки, а не крест
  const sunkCellSet = useMemo(() => {
    const s = new Set<string>();
    for (const sh of ships) {
      if (!sh.sunk) continue;
      for (let i = 0; i < sh.size; i++) {
        const x = sh.orientation === 'H' ? sh.x + i : sh.x;
        const y = sh.orientation === 'V' ? sh.y + i : sh.y;
        s.add(`${x}:${y}`);
      }
    }
    return s;
  }, [ships]);

  const showShips = mode === 'own' || mode === 'placement' || ships.length > 0;
  const sunkShips = useMemo(() => ships.filter((s) => s.sunk), [ships]);
  const cellPct = 100 / BOARD_SIZE;

  return (
    <div className="relative w-full max-w-[440px] mx-auto select-none">
      {/* Графитовая рама */}
      <div
        className="rounded-xl p-2"
        style={{
          background: 'var(--c-panel)',
          boxShadow: 'inset 0 0 0 var(--border-w) var(--c-line), var(--shadow-card)',
        }}
      >
        <div
          className="grid gap-0"
          style={{ gridTemplateColumns: '16px 1fr', gridTemplateRows: '16px auto' }}
        >
          {/* угол */}
          <div />
          {/* буквы сверху */}
          <div className="flex">
            {LETTERS.map((l) => (
              <div key={l} className="flex-1 flex items-center justify-center text-[9px] font-display text-muted">
                {l}
              </div>
            ))}
          </div>
          {/* числа слева */}
          <div className="flex flex-col">
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
              <div key={i} className="flex-1 flex items-center justify-center text-[9px] font-display text-muted">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Игровое поле — квадрат */}
          <div className="relative w-full aspect-square rounded-md overflow-hidden bg-panel">
            {/* Подложка-море */}
            <div className="absolute inset-0 cell-water sea-bg animate-waveDrift" />
            {/* радар-развёртка для вражеского поля в мой ход */}
            {mode === 'enemy' && myTurn && (
              <div
                className="absolute inset-0 pointer-events-none animate-compassSpin opacity-40"
                style={{ background: 'conic-gradient(from 0deg, transparent 74%, rgba(225,87,75,0.22) 90%, transparent 100%)', animationDuration: '4s' }}
              />
            )}
            {/* сетка */}
            <svg className="absolute inset-0 w-full h-full text-muted opacity-40" aria-hidden>
              {Array.from({ length: BOARD_SIZE + 1 }).map((_, i) => (
                <g key={i}>
                  <line x1={`${i * cellPct}%`} y1="0" x2={`${i * cellPct}%`} y2="100%" stroke="currentColor" strokeWidth="1" />
                  <line y1={`${i * cellPct}%`} x1="0" y2={`${i * cellPct}%`} x2="100%" stroke="currentColor" strokeWidth="1" />
                </g>
              ))}
            </svg>

            {/* Целые корабли (свои / расстановка) — под слоем клеток */}
            {showShips &&
              ships.filter((s) => !s.sunk).map((s) => {
                const w = s.orientation === 'H' ? s.size * cellPct : cellPct;
                const h = s.orientation === 'V' ? s.size * cellPct : cellPct;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute"
                    style={{
                      left: `${s.x * cellPct}%`,
                      top: `${s.y * cellPct}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      padding: '2.5%',
                      zIndex: 5,
                    }}
                  >
                    <Ship kind={s.kind} size={s.size} orientation={s.orientation} hits={s.hits} />
                  </motion.div>
                );
              })}

            {/* Слой клеток (клики + метки) */}
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                zIndex: 10,
              }}
            >
              {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, idx) => {
                const x = idx % BOARD_SIZE;
                const y = Math.floor(idx / BOARD_SIZE);
                const key = `${x}:${y}`;
                const att = attackMap.get(key);
                const isGhost = ghostSet.has(key);
                const isHighlight = highlight?.x === x && highlight?.y === y;
                const isClickable =
                  mode === 'placement'
                    ? !disabled
                    : mode === 'enemy' && !disabled && myTurn && !att;
                // Наводящие линии: подсветка ряда/столбца от прицельной клетки (вражеское поле в мой ход)
                const inAimLine =
                  mode === 'enemy' && myTurn && !disabled && !!highlight && !isHighlight &&
                  (highlight!.x === x || highlight!.y === y);

                let cls = 'relative w-full h-full transition-colors';
                if (isGhost) cls += ghostInvalid ? ' cell-ghost-bad' : ' cell-ghost';
                if (isClickable) cls += ' cell-aim';

                const onSunk = sunkCellSet.has(key);
                return (
                  <div
                    key={key}
                    className={cls}
                    onClick={() => isClickable && onCellClick?.(x, y)}
                    onMouseEnter={() => onCellEnter?.(x, y)}
                    onTouchStart={() => onCellEnter?.(x, y)}
                  >
                    {inAimLine && !att && (
                      <span className="absolute inset-0 pointer-events-none bg-danger/10" />
                    )}
                    {att && !onSunk && <Marker hit={att.hit} sunk={false} />}
                    {isHighlight && isClickable && <Crosshair />}
                  </div>
                );
              })}
            </div>

            {/* Верхний слой: обломки потопленных + дым (поверх клеток и крестов) */}
            {sunkShips.map((s) => {
              const w = s.orientation === 'H' ? s.size * cellPct : cellPct;
              const h = s.orientation === 'V' ? s.size * cellPct : cellPct;
              return (
                <motion.div
                  key={`wreck-${s.id}`}
                  initial={{ opacity: 0, scale: 0.7, rotate: -4 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${s.x * cellPct}%`,
                    top: `${s.y * cellPct}%`,
                    width: `${w}%`,
                    height: `${h}%`,
                    padding: '2%',
                    zIndex: 20,
                  }}
                >
                  <Ship kind={s.kind} size={s.size} orientation={s.orientation} sunk />
                  <Smoke seed={s.x + s.y} />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Marker({ hit, sunk }: { hit: boolean; sunk: boolean }) {
  if (!hit) {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(45deg, var(--c-muted) 0px, var(--c-muted) 2px, transparent 2px, transparent 6px)',
          opacity: 0.35,
        }}
      />
    );
  }
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={["absolute inset-[14%] rounded-sm flex items-center justify-center shadow-[2px_2px_0px_#000]", sunk ? "bg-panel border-2 border-danger text-danger" : "bg-danger text-white"].join(' ')}
    >
      <span className="font-display text-[14px] leading-none">✕</span>
    </motion.span>
  );
}

function Crosshair() {
  return (
    <span className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <span className="absolute w-full h-[2px] bg-danger shadow-[2px_2px_0px_#000]" />
      <span className="absolute h-full w-[2px] bg-danger shadow-[2px_2px_0px_#000]" />
    </span>
  );
}
