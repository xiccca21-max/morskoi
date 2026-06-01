import { useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AttackCell, BOARD_SIZE, ShipPlacement } from '../lib/game-types';
import { Ship } from './Ship';
import { VintageShip } from './VintageShip';
import { Smoke } from './Effects';

type Mode = 'own' | 'enemy' | 'placement';

interface BoardProps {
  mode: Mode;
  ships?: ShipPlacement[];
  attacks?: AttackCell[];
  ghostCells?: Array<[number, number]>;
  ghostShip?: Pick<ShipPlacement, 'kind' | 'size' | 'x' | 'y' | 'orientation'> | null;
  ghostInvalid?: boolean;
  onCellClick?: (x: number, y: number) => void;
  onCellEnter?: (x: number, y: number) => void;
  disabled?: boolean;
  myTurn?: boolean;
  highlight?: { x: number; y: number } | null;
  /** Скин кораблей (косметика) для своих/расставляемых судов. */
  skin?: string;
}

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

export function Board({
  mode,
  ships = [],
  attacks = [],
  ghostCells = [],
  ghostShip = null,
  ghostInvalid = false,
  onCellClick,
  onCellEnter,
  disabled = false,
  myTurn = true,
  highlight = null,
  skin = 'classic',
}: BoardProps) {
  const realisticShips = mode === 'placement';
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
  const gridRef = useRef<HTMLDivElement>(null);

  const cellFromClient = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * BOARD_SIZE);
    const y = Math.floor(((clientY - r.top) / r.height) * BOARD_SIZE);
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
    return { x, y };
  }, []);

  const handleGridTouch = useCallback((e: React.TouchEvent) => {
    if (mode !== 'placement' || disabled || !onCellEnter) return;
    const t = e.touches[0];
    if (!t) return;
    const c = cellFromClient(t.clientX, t.clientY);
    if (c) onCellEnter(c.x, c.y);
  }, [mode, disabled, onCellEnter, cellFromClient]);

  return (
    <div className="relative w-full max-w-[480px] mx-auto select-none">
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
          <motion.div
            key={mode}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative w-full aspect-square rounded-md overflow-hidden bg-panel"
          >
            {/* Подложка-море (живая вода) */}
            <div className="absolute inset-0 cell-water sea-bg" />
            {/* Блик на поверхности */}
            <div className="absolute inset-0 pointer-events-none sea-sheen" />
            {/* радар-развёртка для вражеского поля в мой ход */}
            {mode === 'enemy' && myTurn && (
              <>
                <div
                  className="absolute inset-0 pointer-events-none animate-compassSpin opacity-50"
                  style={{ background: 'conic-gradient(from 0deg, transparent 72%, rgba(225,87,75,0.12) 92%, transparent 100%)', animationDuration: '4s' }}
                />
                {/* мягкое сонарное «дыхание» */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 40px rgba(225,87,75,0.08)' }}
                  animate={{ opacity: [0.2, 0.45, 0.2] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              </>
            )}
            {/* сетка */}
            <svg className="absolute inset-0 w-full h-full text-main opacity-[0.18]" aria-hidden>
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
                      zIndex: 5,
                    }}
                  >
                    {realisticShips ? (
                      <VintageShip kind={s.kind} size={s.size} orientation={s.orientation} />
                    ) : (
                      <Ship kind={s.kind} size={s.size} orientation={s.orientation} hits={s.hits} skin={skin} />
                    )}
                  </motion.div>
                );
              })}

            {/* Превью корабля при расстановке */}
            {mode === 'placement' && ghostShip && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: ghostInvalid ? 0.45 : 0.72 }}
                className="absolute pointer-events-none"
                style={{
                  left: `${ghostShip.x * cellPct}%`,
                  top: `${ghostShip.y * cellPct}%`,
                  width: `${ghostShip.orientation === 'H' ? ghostShip.size * cellPct : cellPct}%`,
                  height: `${ghostShip.orientation === 'V' ? ghostShip.size * cellPct : cellPct}%`,
                  zIndex: 8,
                  filter: ghostInvalid ? 'sepia(1) saturate(3) hue-rotate(-30deg)' : undefined,
                }}
              >
                {realisticShips ? (
                  <VintageShip kind={ghostShip.kind} size={ghostShip.size} orientation={ghostShip.orientation} />
                ) : (
                  <Ship kind={ghostShip.kind} size={ghostShip.size} orientation={ghostShip.orientation} skin={skin} />
                )}
              </motion.div>
            )}

            {/* Слой клеток (клики + метки) */}
            <div
              ref={gridRef}
              className="absolute inset-0 grid touch-none"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                zIndex: 10,
              }}
              onTouchMove={handleGridTouch}
              onTouchStart={handleGridTouch}
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
                const showCrosshair =
                  isHighlight && isClickable && (mode === 'enemy' || mode === 'placement');
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
                    {att && !onSunk && <Marker hit={att.hit} />}
                    {showCrosshair && <Crosshair />}
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
                    zIndex: 20,
                  }}
                >
                  <Ship kind={s.kind} size={s.size} orientation={s.orientation} sunk />
                  <Smoke seed={s.x + s.y} />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Marker({ hit }: { hit: boolean }) {
  if (!hit) {
    // Промах: клетка плавно закрашивается целиком (без кругов/точек).
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'color-mix(in srgb, var(--c-muted) 34%, transparent)' }}
      />
    );
  }
  // Попадание: тлеющий очаг + «впечатывающийся» крест + ударное кольцо.
  return (
    <span className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* постоянное тление — клетка «горит» */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle, rgba(255,140,60,0.55) 0%, rgba(225,87,75,0.35) 45%, transparent 72%)' }}
      />
      <motion.span
        initial={{ scale: 0, rotate: -18, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 17 }}
        className="absolute inset-[14%] rounded-sm bg-danger text-white flex items-center justify-center shadow-[2px_2px_0px_#000]"
      >
        <span className="font-display text-[14px] leading-none">✕</span>
      </motion.span>
      <motion.span
        initial={{ scale: 0.3, opacity: 0.7 }}
        animate={{ scale: 2.2, opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-[12%] rounded-full border-2 border-danger"
      />
    </span>
  );
}

function Crosshair() {
  // Прицел «захвата цели»: угловые скобки + пульсирующее кольцо и точка.
  const corner = 'absolute w-[28%] h-[28%] border-danger';
  return (
    <motion.span
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0, scale: 1.25 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <span className={`${corner} top-[6%] left-[6%] border-t-2 border-l-2`} />
      <span className={`${corner} top-[6%] right-[6%] border-t-2 border-r-2`} />
      <span className={`${corner} bottom-[6%] left-[6%] border-b-2 border-l-2`} />
      <span className={`${corner} bottom-[6%] right-[6%] border-b-2 border-r-2`} />
      <motion.span
        className="absolute inset-[30%] rounded-full border border-danger"
        animate={{ scale: [1, 1.3, 1], opacity: [0.9, 0.4, 0.9] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[6%] h-[6%] rounded-full bg-danger" />
    </motion.span>
  );
}
