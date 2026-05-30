import { useState } from 'react';

// Палитра для фоновых инициалов — детерминированно по имени.
const COLORS = [
  '#E1574B', '#2563EB', '#7C3AED', '#0891B2',
  '#059669', '#D97706', '#DB2777', '#475569',
];

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number;
  rounded?: 'full' | 'lg';
  className?: string;
}

/** Аватар: фото если есть, иначе цветной кружок с инициалом. Падение фото — fallback на инициалы. */
export function Avatar({ name, src, size = 40, rounded = 'full', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = (name ?? '').trim();
  const initial = label ? label[0].toUpperCase() : '?';
  const radius = rounded === 'full' ? '9999px' : '12px';
  const showImg = src && !failed;

  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden font-display text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImg ? 'transparent' : hashColor(label || 'guest'),
        fontSize: size * 0.42,
      }}
    >
      {showImg ? (
        <img
          src={src!}
          alt=""
          className="w-full h-full object-cover"
          style={{ borderRadius: radius }}
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
