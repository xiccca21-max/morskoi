import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AttackCell, BOARD_SIZE, ShipPlacement, shipCells } from '../lib/game-types';

type Mode = 'own' | 'enemy' | 'placement';

interface BoardProps {
  mode: Mode;
  ships?: ShipPlacement[];                  // отображаемые корабли
  attacks?: AttackCell[];                    // полученные атаки (для own/enemy)
  ghostCells?: Array<[number, number]>;      // подсветка при drag (placement)
  ghostInvalid?: boolean;                    // подсветка красным
  onCellClick?: (x: number, y: number) => void;
  onCellEnter?: (x: number, y: number) => void;
  disabled?: boolean;
  myTurn?: boolean;
  highlight?: { x: number; y: number } | null; // сонар-метка
}

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
  const shipsGrid = useMemo(() => {
    const g: (ShipPlacement | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill(null),
    );
    for (const s of ships) {
      for (const [x, y] of shipCells(s)) {
        if (x < BOARD_SIZE && y < BOARD_SIZE && x >= 0 && y >= 0) g[y][x] = s;
      }
    }
    return g;
  }, [ships]);

  const attackMap = useMemo(() => {
    const m = new Map<string, AttackCell>();
    for (const a of attacks) m.set(`${a.x}:${a.y}`, a);
    return m;
  }, [attacks]);

  const ghostSet = useMemo(() => new Set(ghostCells.map(([x, y]) => `${x}:${y}`)), [ghostCells]);

  return (
    <div className="relative aspect-square w-full max-w-[440px] mx-auto select-none">
      {/* Радар фон */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-950 border border-cyber-cyan/20 overflow-hidden water-bg">
        {/* радар-развёртка для enemy при моём ходе */}
        {mode === 'enemy' && myTurn && (
          <div
            className="absolute inset-0 pointer-events-none origin-center animate-radarSweep"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 70%, rgba(34,211,238,0.18) 88%, transparent 100%)',
            }}
          />
        )}
        {/* координатная сетка */}
        <svg className="absolute inset-0 w-full h-full text-cyber-cyan/15" aria-hidden>
          {Array.from({ length: BOARD_SIZE + 1 }).map((_, i) => (
            <g key={i}>
              <line
                x1={`${(i * 100) / BOARD_SIZE}%`} y1="0"
                x2={`${(i * 100) / BOARD_SIZE}%`} y2="100%"
                stroke="currentColor" strokeWidth="1"
              />
              <line
                y1={`${(i * 100) / BOARD_SIZE}%`} x1="0"
                y2={`${(i * 100) / BOARD_SIZE}%`} x2="100%"
                stroke="currentColor" strokeWidth="1"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Клетки */}
      <div className="absolute inset-0 grid"
           style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`, gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)` }}>
        {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, idx) => {
          const x = idx % BOARD_SIZE;
          const y = Math.floor(idx / BOARD_SIZE);
          const key = `${x}:${y}`;
          const ship = shipsGrid[y][x];
          const att = attackMap.get(key);
          const isGhost = ghostSet.has(key);
          const isHighlight = highlight?.x === x && highlight?.y === y;
          // показываем корабли только в режимах own/placement
          const showShip = (mode === 'own' || mode === 'placement') && !!ship;
          const isClickable = mode === 'enemy' && !disabled && myTurn && !att;

          let cellClasses = 'relative w-full h-full transition-colors';
          if (showShip) cellClasses += ship!.sunk ? ' cell-sunk' : ' cell-ship';
          if (att?.hit && mode === 'enemy') cellClasses += ' cell-hit';
          if (att && !att.hit) cellClasses += ' cell-miss';
          if (att?.sunkShipId && mode === 'enemy') cellClasses += ' cell-sunk';
          if (isGhost) cellClasses += ghostInvalid ? ' bg-cyber-red/40' : ' bg-cyber-cyan/30';
          if (isClickable) cellClasses += ' hover:bg-cyber-cyan/15 cursor-crosshair';

          return (
            <div
              key={key}
              className={cellClasses}
              onClick={() => isClickable && onCellClick?.(x, y)}
              onMouseEnter={() => onCellEnter?.(x, y)}
              onTouchStart={() => onCellEnter?.(x, y)}
            >
              {/* индикатор центра */}
              {att && (
                <>
                  {att.hit ? (
                    <motion.span
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute inset-1 rounded-full bg-cyber-red shadow-[0_0_18px_rgba(239,68,68,0.7)]"
                    />
                  ) : (
                    <motion.span
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute inset-[35%] rounded-full bg-blue-200/80"
                    />
                  )}
                </>
              )}
              {isHighlight && <SonarRing />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SonarRing() {
  return (
    <>
      <span className="sonar-ring animate-sonarPulse" />
      <span className="sonar-ring animate-sonarPulse" style={{ animationDelay: '0.4s' }} />
      <span className="sonar-ring animate-sonarPulse" style={{ animationDelay: '0.8s' }} />
    </>
  );
}
