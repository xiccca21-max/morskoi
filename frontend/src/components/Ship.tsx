import type { ShipKind, Orientation } from '../lib/game-types';

/** Цвет корпуса по скину (косметика). classic = цвет темы. */
const SKIN_HULL: Record<string, string> = {
  classic: 'var(--c-main)',
  corsair: '#7c1f2b', // багровый корсар
  steel: '#33536e',   // стальной флот
};

interface ShipProps {
  kind: ShipKind;
  size: number;
  orientation: Orientation;
  hits?: number;
  sunk?: boolean;
  /** Скин корпуса (косметика): classic | corsair | steel. */
  skin?: string;
  /** Маленькая иконка (для списков верфи) — рисуем всегда горизонтально. */
  icon?: boolean;
  className?: string;
}

/**
 * Брутальный силуэт корабля: сплошной корпус, толстая обводка, простые палубные блоки.
 * Длинная ось масштабируется под количество клеток (size). Цвета берутся из темы.
 */
export function Ship({ kind, size, orientation, sunk = false, skin = 'classic', icon = false, className }: ShipProps) {
  const L = size * 100;
  const horizontal = icon ? true : orientation === 'H';

  // координаты: along вдоль длинной оси, across поперёк
  const pt = (along: number, across: number): [number, number] =>
    horizontal ? [along, across] : [across, along];
  const P = (a: number, c: number) => pt(a, c).join(',');

  const viewBox = horizontal ? `0 0 ${L} 100` : `0 0 100 ${L}`;

  const hull = sunk ? 'var(--c-danger)' : (SKIN_HULL[skin] ?? 'var(--c-main)');
  // палубные блоки — «вырезы» цветом фона, чтобы читались на корпусе в любой теме
  const deck = 'var(--c-base)';

  // ===== Потопленный корабль: разорванный на две накренённые части корпус =====
  if (sunk) {
    const brk = L * 0.5;          // точка разлома
    const gap = Math.min(26, L * 0.07);
    const stern = 14;
    const bow = L - 6;
    // Левая часть кормы — кренится носовой кромкой вниз (в разлом)
    const left = [
      `M ${P(stern, 24)}`,
      `Q ${P(stern, 50)} ${P(stern, 76)}`,
      `L ${P(brk - gap, 88)}`,         // у разлома осела вниз
      `L ${P(brk - gap - 8, 60)}`,     // рваный край
      `L ${P(brk - gap - 2, 44)}`,
      `L ${P(brk - gap - 12, 30)}`,
      'Z',
    ].join(' ');
    // Правая часть с носом — задрана у разлома, нос торчит вверх
    const right = [
      `M ${P(brk + gap, 30)}`,
      `L ${P(brk + gap + 10, 52)}`,    // рваный край
      `L ${P(brk + gap + 2, 66)}`,
      `L ${P(brk + gap + 14, 80)}`,
      `L ${P(bow - 34, 80)}`,
      `Q ${P(bow, 66)} ${P(bow, 50)}`, // нос
      `Q ${P(bow, 36)} ${P(bow - 34, 26)}`,
      'Z',
    ].join(' ');
    // Пробоины
    const holes = [pt(brk - gap - 18, 52), pt(brk + gap + 22, 48)];
    return (
      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        className={className}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        <path d={left} fill={hull} stroke="var(--c-line)" strokeWidth={3} strokeLinejoin="round" />
        <path d={right} fill={hull} stroke="var(--c-line)" strokeWidth={3} strokeLinejoin="round" />
        {holes.map(([hx, hy], i) => (
          <circle key={i} cx={hx} cy={hy} r={7} fill="var(--c-base)" opacity={0.85} />
        ))}
      </svg>
    );
  }

  // Корпус: корма скруглена, нос заострён. Силуэт растянут почти на всю клетку.
  const bowTip = L - 2;
  const bowBase = L - 34;
  const hullPath = [
    `M ${P(6, 10)}`,
    `Q ${P(6, 50)} ${P(6, 90)}`,              // скруглённая корма
    `L ${P(bowBase, 90)}`,
    `Q ${P(bowTip, 70)} ${P(bowTip, 50)}`,    // нос
    `Q ${P(bowTip, 30)} ${P(bowBase, 10)}`,
    'Z',
  ].join(' ');

  void deck;
  const uid = `${kind}-${size}-${horizontal ? 'h' : 'v'}`;
  const gid = `hullg-${uid}`;
  const cid = `hullc-${uid}`;

  // Детали в координатах along/across (along — вдоль длинной оси).
  const marks: JSX.Element[] = [];
  let k = 0;
  // Прямоугольник по углу (a0,c0) и размерам вдоль/поперёк — учитывает ориентацию.
  const rer = (a0: number, aLen: number, c0: number, cLen: number, fill: string, rx = 0, opacity = 1) => {
    const [x, y] = pt(a0, c0);
    marks.push(
      <rect
        key={`r${k++}`}
        x={x}
        y={y}
        width={horizontal ? aLen : cLen}
        height={horizontal ? cLen : aLen}
        rx={rx}
        fill={fill}
        opacity={opacity}
      />,
    );
  };
  const cir = (a: number, c: number, r: number, fill: string, opacity = 1) => {
    const [cx, cy] = pt(a, c);
    marks.push(<circle key={`c${k++}`} cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} />);
  };
  // Орудийная башня с двумя стволами, направленными к носу.
  const turret = (a: number, r = 13, barrel = 34) => {
    rer(a - r, r * 2, 50 - r, r * 2, 'rgba(0,0,0,0.34)', r * 0.55);
    rer(a + r * 0.4, barrel, 44, 4, 'var(--c-line)', 1);
    rer(a + r * 0.4, barrel, 52, 4, 'var(--c-line)', 1);
    cir(a, 50, r * 0.45, 'rgba(255,255,255,0.18)');
  };
  // Дымовая труба.
  const funnel = (a: number, w = 16) => {
    rer(a - w / 2, w, 36, 28, 'rgba(0,0,0,0.40)', 2);
    rer(a - w / 2, w, 34, 5, 'rgba(0,0,0,0.55)', 1);
  };
  // Мостик/надстройка (ступенчатая).
  const bridge = (a: number, len: number) => {
    rer(a - len / 2, len, 30, 40, 'rgba(255,255,255,0.16)', 3);
    rer(a - len / 4, len / 2, 38, 24, 'rgba(255,255,255,0.24)', 2);
    cir(a, 50, 4, 'rgba(0,0,0,0.45)'); // мачта/радар
  };
  // Иллюминаторы вдоль борта.
  const portholes = (from: number, to: number, step: number) => {
    for (let a = from; a <= to; a += step) cir(a, 70, 2.4, 'rgba(0,0,0,0.35)');
  };

  // Приподнятая палуба (светлая полоса по всей длине).
  rer(8, L - 14, 28, 44, 'rgba(255,255,255,0.10)', 8);

  if (kind === 'submarine') {
    // ПЛ: рубка + перископ + люки.
    rer(40, 24, 38, 24, 'rgba(255,255,255,0.20)', 5);
    rer(58, 4, 22, 18, 'var(--c-line)', 1); // перископ
    cir(28, 50, 3.5, 'rgba(0,0,0,0.4)');
    cir(76, 50, 3.5, 'rgba(0,0,0,0.4)');
  } else if (kind === 'destroyer') {
    turret(150, 11, 30);   // носовое орудие
    bridge(95, 34);
    funnel(125, 14);
    portholes(30, 80, 18);
  } else if (kind === 'cruiser') {
    turret(248, 12, 34);   // носовое
    turret(60, 12, 30);    // кормовое
    bridge(150, 40);
    funnel(180, 16);
    funnel(205, 16);
    portholes(30, 110, 18);
  } else {
    // battleship (4)
    turret(330, 14, 40);   // носовые орудия
    turret(285, 13, 36);
    turret(70, 14, 38);    // кормовое
    bridge(180, 52);
    funnel(215, 18);
    funnel(245, 18);
    portholes(30, 130, 16);
  }

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2={horizontal ? '0' : '1'} y2={horizontal ? '1' : '0'}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.32" />
        </linearGradient>
        <clipPath id={cid}>
          <path d={hullPath} />
        </clipPath>
      </defs>
      {/* Корпус с обводкой */}
      <path d={hullPath} fill={hull} stroke="var(--c-line)" strokeWidth={3} strokeLinejoin="round" />
      {/* Объём и надстройки — обрезаны по силуэту корпуса */}
      <g clipPath={`url(#${cid})`}>
        <rect x={0} y={0} width={horizontal ? L : 100} height={horizontal ? 100 : L} fill={`url(#${gid})`} />
        {marks}
      </g>
    </svg>
  );
}
