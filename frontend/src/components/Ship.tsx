import type { ShipKind, Orientation } from '../lib/game-types';

interface ShipProps {
  kind: ShipKind;
  size: number;
  orientation: Orientation;
  hits?: number;
  sunk?: boolean;
  /** Маленькая иконка (для списков верфи) — рисуем всегда горизонтально. */
  icon?: boolean;
  className?: string;
}

/**
 * Брутальный силуэт корабля: сплошной корпус, толстая обводка, простые палубные блоки.
 * Длинная ось масштабируется под количество клеток (size). Цвета берутся из темы.
 */
export function Ship({ kind, size, orientation, sunk = false, icon = false, className }: ShipProps) {
  const L = size * 100;
  const horizontal = icon ? true : orientation === 'H';

  // координаты: along вдоль длинной оси, across поперёк
  const pt = (along: number, across: number): [number, number] =>
    horizontal ? [along, across] : [across, along];
  const P = (a: number, c: number) => pt(a, c).join(',');

  const viewBox = horizontal ? `0 0 ${L} 100` : `0 0 100 ${L}`;

  const hull = sunk ? 'var(--c-danger)' : 'var(--c-main)';
  // палубные блоки — «вырезы» цветом фона, чтобы читались на корпусе в любой теме
  const deck = 'var(--c-base)';

  // Корпус: корма скруглена, нос заострён
  const bowTip = L - 6;
  const bowBase = L - 40;
  const hullPath = [
    `M ${P(14, 22)}`,
    `Q ${P(14, 50)} ${P(14, 78)}`,            // скруглённая корма
    `L ${P(bowBase, 78)}`,
    `Q ${P(bowTip, 64)} ${P(bowTip, 50)}`,    // нос
    `Q ${P(bowTip, 36)} ${P(bowBase, 22)}`,
    'Z',
  ].join(' ');

  // Палубные блоки (надстройки) — простые квадраты/круги
  const deckMarks: JSX.Element[] = [];
  const block = (along: number, w = 26) => {
    const [cx, cy] = pt(along, 50);
    return (
      <rect
        key={`b${along}`}
        x={cx - (horizontal ? w / 2 : 14)}
        y={cy - (horizontal ? 14 : w / 2)}
        width={horizontal ? w : 28}
        height={horizontal ? 28 : w}
        rx={2}
        fill={deck}
      />
    );
  };
  const dot = (along: number, r = 11) => {
    const [cx, cy] = pt(along, 50);
    return <circle key={`d${along}`} cx={cx} cy={cy} r={r} fill={deck} />;
  };

  if (kind === 'submarine') {
    deckMarks.push(dot(50, 13));
  } else if (kind === 'destroyer') {
    deckMarks.push(block(70, 28), dot(150, 9));
  } else if (kind === 'cruiser') {
    deckMarks.push(dot(55, 11), block(150, 34), dot(245, 11));
  } else {
    // battleship (4)
    deckMarks.push(dot(60, 12), block(175, 40), dot(245, 12), dot(330, 12));
  }

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
    >
      {/* Корпус */}
      <path d={hullPath} fill={hull} strokeLinejoin="round" />
      {/* Палубные блоки (вырезы цветом фона) */}
      {deckMarks}
    </svg>
  );
}
