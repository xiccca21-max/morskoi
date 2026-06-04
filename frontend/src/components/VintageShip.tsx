import type { ShipKind, Orientation } from '../lib/game-types';

interface VintageShipProps {
  kind: ShipKind;
  size: number;
  orientation: Orientation;
  sunk?: boolean;
  icon?: boolean;
  /** Скин корпуса (косметика): classic | corsair | steel. */
  skin?: string;
  className?: string;
}

// Металлический градиент корпуса по скину (4 стопа: блик → корпус → тень → дно).
const SKIN_METAL: Record<string, [string, string, string, string]> = {
  classic: ['#9aa3ac', '#6d7780', '#4a535b', '#353c42'],
  steel: ['#b6c7d8', '#82a0bd', '#4f7194', '#33506e'],
  corsair: ['#caa0a4', '#a84a52', '#7c2730', '#511a20'],
};
// Градиент палубы по скину (верх → низ).
const SKIN_DECK: Record<string, [string, string]> = {
  classic: ['#7a848d', '#525a62'],
  steel: ['#8aa0b8', '#516d8c'],
  corsair: ['#a55d63', '#6e2730'],
};

/**
 * Винтажный вид сверху: металлический корпус, башни, надстройка — как на тактической карте.
 * Цвет корпуса/палубы зависит от выбранного скина.
 */
export function VintageShip({
  kind,
  size,
  orientation,
  sunk = false,
  icon = false,
  skin = 'classic',
  className = '',
}: VintageShipProps) {
  const metal = SKIN_METAL[skin] ?? SKIN_METAL.classic;
  const deckGrad = SKIN_DECK[skin] ?? SKIN_DECK.classic;
  const L = size * 100;
  const horizontal = icon ? true : orientation === 'H';
  const viewBox = horizontal ? `0 0 ${L} 100` : `0 0 100 ${L}`;
  const uid = `vs-${kind}-${size}-${horizontal ? 'h' : 'v'}`;

  const pt = (along: number, across: number): [number, number] =>
    horizontal ? [along, across] : [across, along];
  const P = (a: number, c: number) => pt(a, c).join(',');

  const bowTip = L - 4;
  const bowBase = L - Math.min(38, L * 0.28);
  const stern = 8;

  const hullPath = [
    `M ${P(stern, 18)}`,
    `Q ${P(stern, 50)} ${P(stern, 82)}`,
    `L ${P(bowBase, 82)}`,
    `Q ${P(bowTip, 62)} ${P(bowTip, 50)}`,
    `Q ${P(bowTip, 38)} ${P(bowBase, 18)}`,
    'Z',
  ].join(' ');

  const deckPath = [
    `M ${P(stern + 6, 30)}`,
    `L ${P(bowBase - 4, 30)}`,
    `Q ${P(bowTip - 8, 42)} ${P(bowTip - 8, 50)}`,
    `Q ${P(bowTip - 8, 58)} ${P(bowBase - 4, 70)}`,
    `L ${P(stern + 6, 70)}`,
    'Z',
  ].join(' ');

  const hullFill = sunk ? '#8b3a3a' : 'url(#metal-' + uid + ')';
  const stroke = '#1a1a1a';

  const turretPositions = (): number[] => {
    if (size === 1) return [L * 0.5];
    if (size === 2) return [L * 0.35, L * 0.72];
    if (size === 3) return [L * 0.22, L * 0.52, L * 0.78];
    return [L * 0.18, L * 0.38, L * 0.62, L * 0.82];
  };

  const bridgeAt = L * (size >= 4 ? 0.48 : size === 3 ? 0.5 : 0.55);
  const funnelAt = L * (size >= 3 ? 0.58 : 0.62);

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio={icon ? 'xMidYMid meet' : 'none'}
      className={['vintage-ship-shadow', className].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`metal-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={metal[0]} />
          <stop offset="35%" stopColor={metal[1]} />
          <stop offset="70%" stopColor={metal[2]} />
          <stop offset="100%" stopColor={metal[3]} />
        </linearGradient>
        <linearGradient id={`deck-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={deckGrad[0]} />
          <stop offset="100%" stopColor={deckGrad[1]} />
        </linearGradient>
        <clipPath id={`clip-${uid}`}>
          <path d={hullPath} />
        </clipPath>
      </defs>

      <path d={hullPath} fill={hullFill} stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={deckPath} fill={`url(#deck-${uid})`} opacity={0.85} stroke={stroke} strokeWidth={1} />

      <g clipPath={`url(#clip-${uid})`}>
        {/* Надстройка / мостик */}
        <rect
          x={horizontal ? bridgeAt - 14 : 36}
          y={horizontal ? 36 : bridgeAt - 14}
          width={horizontal ? 28 : 28}
          height={horizontal ? 28 : 28}
          rx={3}
          fill="#4a535b"
          stroke={stroke}
          strokeWidth={1.2}
        />
        <rect
          x={horizontal ? bridgeAt - 8 : 42}
          y={horizontal ? 42 : bridgeAt - 8}
          width={horizontal ? 16 : 16}
          height={horizontal ? 16 : 16}
          rx={2}
          fill="#6d7780"
          stroke={stroke}
          strokeWidth={0.8}
        />

        {/* Труба */}
        {size >= 2 && (
          <rect
            x={horizontal ? funnelAt - 7 : 34}
            y={horizontal ? 28 : funnelAt - 7}
            width={horizontal ? 14 : 32}
            height={horizontal ? 22 : 14}
            rx={2}
            fill="#3a4249"
            stroke={stroke}
            strokeWidth={1}
          />
        )}

        {/* Башни */}
        {turretPositions().map((a, i) => {
          const [cx, cy] = pt(a, 50);
          const r = size === 1 ? 10 : size === 2 ? 11 : 12;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="#525a62" stroke={stroke} strokeWidth={1.2} />
              <circle cx={cx} cy={cy} r={r * 0.45} fill="#8a939c" opacity={0.5} />
              {/* Стволы к носу */}
              <line
                x1={cx + (horizontal ? r * 0.3 : 0)}
                y1={cy + (horizontal ? 0 : r * 0.3)}
                x2={cx + (horizontal ? r + 14 : 0)}
                y2={cy + (horizontal ? 0 : r + 14)}
                stroke={stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <line
                x1={cx + (horizontal ? r * 0.3 : -4)}
                y1={cy + (horizontal ? -4 : r * 0.3)}
                x2={cx + (horizontal ? r + 10 : -4)}
                y2={cy + (horizontal ? -4 : r + 10)}
                stroke={stroke}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Иллюминаторы */}
        {Array.from({ length: Math.max(2, size * 2) }).map((_, i) => {
          const t = (i + 1) / (Math.max(2, size * 2) + 1);
          const [px, py] = pt(stern + 12 + t * (L - stern - 24), 74);
          return <circle key={i} cx={px} cy={py} r={2} fill="#2b2b2b" opacity={0.45} />;
        })}
      </g>

      {sunk && (
        <>
          {(() => {
            const [x1, y1] = pt(L * 0.45, 22);
            const [x2, y2] = pt(L * 0.55, 78);
            const [cx, cy] = pt(L * 0.5, 50);
            return (
              <>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a1a1a" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={8} fill="#f5eedc" opacity={0.9} />
              </>
            );
          })()}
        </>
      )}
    </svg>
  );
}
