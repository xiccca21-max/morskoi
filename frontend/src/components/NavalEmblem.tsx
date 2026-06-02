import { useId } from 'react';

/** Премиальный знак бренда: медальон с компасной звездой (морская навигация).
 *  Тонкий золотой ободок, чёткая роза ветров, красный сердечник.
 *  Используется в шапке и на splash — единый фирменный стиль. */
export function NavalEmblem({ size = 34 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const gold = `gold-${uid}`;
  const red = `red-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      {/* Внешний золотой ободок */}
      <circle cx="20" cy="20" r="18.5" stroke={`url(#${gold})`} strokeWidth="1.3" fill="none" />
      {/* Внутренний тонкий ободок */}
      <circle cx="20" cy="20" r="15.2" stroke={`url(#${gold})`} strokeWidth="0.7" strokeOpacity="0.35" fill="none" />

      {/* Диагональные (тонкие) лучи розы ветров */}
      <path
        d="M20 20 L26 14 L20 20 L26 26 L20 20 L14 26 L20 20 L14 14 Z"
        fill={`url(#${gold})`}
        fillOpacity="0.45"
      />
      {/* Главные (острые) лучи — N/S/E/W */}
      <path
        d="M20 4.5 L22.4 18 L20 20 L17.6 18 Z"
        fill={`url(#${gold})`}
      />
      <path
        d="M20 35.5 L22.4 22 L20 20 L17.6 22 Z"
        fill={`url(#${gold})`}
      />
      <path
        d="M35.5 20 L22 22.4 L20 20 L22 17.6 Z"
        fill={`url(#${gold})`}
      />
      <path
        d="M4.5 20 L18 22.4 L20 20 L18 17.6 Z"
        fill={`url(#${gold})`}
      />

      {/* Красный сердечник */}
      <circle cx="20" cy="20" r="2.6" fill={`url(#${red})`} />
      <circle cx="20" cy="20" r="2.6" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" fill="none" />

      <defs>
        <linearGradient id={gold} x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f6dd8e" />
          <stop offset="48%" stopColor="#e3b94a" />
          <stop offset="100%" stopColor="#b8860f" />
        </linearGradient>
        <radialGradient id={red} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#ff6a5c" />
          <stop offset="60%" stopColor="#e02b1f" />
          <stop offset="100%" stopColor="#a01510" />
        </radialGradient>
      </defs>
    </svg>
  );
}
