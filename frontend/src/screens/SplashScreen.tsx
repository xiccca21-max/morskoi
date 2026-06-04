import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

const INK = '#15110E';
const RED = '#E1574B';

// Спицы штурвала: линия от ступицы через обод к рукояти + набалдашник на конце.
const SPOKES = Array.from({ length: 8 }, (_, i) => {
  const a = (i * 45 * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x1: 50 + 9 * c,
    y1: 50 + 9 * s,
    hx: 50 + 44 * c,
    hy: 50 + 44 * s,
  };
});

export default function SplashScreen() {
  const navigate = useNavigate();
  const { ready, authenticated } = useAuthStore();

  useEffect(() => {
    if (ready && authenticated) {
      const t = setTimeout(() => navigate('/home'), 700);
      return () => clearTimeout(t);
    }
  }, [ready, authenticated, navigate]);

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col items-center justify-center gap-6 text-center overflow-hidden"
      style={{ backgroundColor: '#EAE6D7' }}
    >
      {/* Тонкая диагональная штриховка — фактура фона */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 12px)',
        }}
      />

      {/* Вращающийся штурвал */}
      <svg
        viewBox="0 0 100 100"
        width={92}
        height={92}
        className="splash-wheel relative"
        style={{ overflow: 'visible' }}
        aria-hidden
      >
        <circle cx={50} cy={50} r={31} fill="none" stroke={INK} strokeWidth={5} />
        {SPOKES.map((sp, i) => (
          <g key={i}>
            <line x1={sp.x1} y1={sp.y1} x2={sp.hx} y2={sp.hy} stroke={INK} strokeWidth={4} strokeLinecap="round" />
            <circle cx={sp.hx} cy={sp.hy} r={3.4} fill={INK} />
          </g>
        ))}
        <circle cx={50} cy={50} r={9} fill={INK} />
        <circle cx={50} cy={50} r={3.6} fill={RED} />
      </svg>

      {/* Логотип + красный акцент */}
      <div className="relative flex flex-col items-center gap-3">
        <h1
          className="font-display uppercase"
          style={{ fontSize: 30, letterSpacing: '0.2em', fontWeight: 700, color: INK }}
        >
          Морской&nbsp;Бой
        </h1>
        <span style={{ width: 56, height: 3, background: RED, borderRadius: 2 }} />
        <p
          className="font-display uppercase"
          style={{ fontSize: 12, letterSpacing: '0.26em', fontWeight: 500, color: '#6b655a' }}
        >
          Загрузка
        </p>
      </div>

      {/* Индетерминированная полоса загрузки */}
      <div
        className="relative overflow-hidden"
        style={{ width: 150, height: 3, borderRadius: 3, background: 'rgba(0,0,0,0.12)' }}
      >
        <div
          className="splash-load-bar absolute inset-y-0"
          style={{ width: '40%', background: RED, borderRadius: 3 }}
        />
      </div>
    </div>
  );
}
