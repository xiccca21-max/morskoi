import { motion } from 'framer-motion';

/** Многослойный взрыв: вспышка → огненный шар → ударная волна → осколки → дым. */
export function Explosion({ keyId }: { keyId: number }) {
  const debris = Array.from({ length: 12 });
  return (
    <div key={keyId} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      {/* Вспышка */}
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 1.4, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute w-28 h-28 rounded-full"
        style={{ background: 'radial-gradient(circle, #fffbe6 0%, #ffce6b 40%, transparent 70%)' }}
      />
      {/* Огненный шар */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1, 0.85], opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.3, 1] }}
        className="absolute w-24 h-24 rounded-full"
        style={{ background: 'radial-gradient(circle, #fff0b0 0%, #ffae3b 35%, #e8604d 60%, #7a1f15 85%, transparent 100%)' }}
      />
      {/* Ударная волна */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 2.2, opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute w-24 h-24 rounded-full border-2"
        style={{ borderColor: 'rgba(255,206,107,0.8)' }}
      />
      {/* Осколки */}
      {debris.map((_, i) => {
        const ang = (i / debris.length) * Math.PI * 2;
        const dist = 60 + Math.random() * 40;
        return (
          <motion.span
            key={i}
            className="absolute rounded-[1px]"
            style={{ width: 4, height: 4, background: i % 2 ? '#ffce6b' : '#e8604d' }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        );
      })}
      {/* Дым */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0, y: 0 }}
        animate={{ scale: 1.6, opacity: [0, 0.5, 0], y: -30 }}
        transition={{ duration: 1.2, delay: 0.2 }}
        className="absolute w-20 h-20 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(60,60,60,0.8), transparent 70%)' }}
      />
    </div>
  );
}

/** Всплеск воды при промахе: столб → кольцо → брызги. */
export function Splash({ keyId }: { keyId: number }) {
  const drops = Array.from({ length: 8 });
  return (
    <div key={keyId} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <motion.div
        initial={{ scaleY: 0.2, opacity: 0 }}
        animate={{ scaleY: [0.2, 1, 0.6], opacity: [0, 1, 0] }}
        transition={{ duration: 0.5 }}
        className="absolute w-6 h-16 rounded-full origin-bottom"
        style={{ background: 'linear-gradient(to top, rgba(143,166,179,0.9), rgba(230,232,235,0.2))' }}
      />
      <motion.div
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="absolute w-16 h-16 rounded-full border-2"
        style={{ borderColor: 'rgba(230,232,235,0.6)' }}
      />
      {drops.map((_, i) => {
        const ang = (i / drops.length) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{ background: 'rgba(230,232,235,0.85)' }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(ang) * 40, y: Math.sin(ang) * 40 - 10, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

/** Постоянный дым над обломками потопленного корабля. */
export function Smoke({ seed = 0 }: { seed?: number }) {
  const puffs = [0, 1, 2];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center overflow-visible">
      {puffs.map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            bottom: '40%',
            width: 12 + i * 3,
            height: 12 + i * 3,
            background: 'radial-gradient(circle, rgba(70,70,70,0.55), rgba(70,70,70,0) 70%)',
          }}
          initial={{ y: 6, x: 0, opacity: 0, scale: 0.5 }}
          animate={{ y: -34 - i * 6, x: (i % 2 ? 1 : -1) * (4 + i * 2), opacity: [0, 0.6, 0], scale: 1.7 }}
          transition={{
            duration: 2.4 + i * 0.4,
            repeat: Infinity,
            ease: 'easeOut',
            delay: (seed % 3) * 0.3 + i * 0.5,
          }}
        />
      ))}
    </div>
  );
}

const CONFETTI_COLORS = ['#FFCE6B', '#C8453B', '#4AF626', '#6BB6FF', '#FFFFFF', '#FF8A3B'];

/** Праздничный салют при победе: вспышка + радиальный взрыв + падающее конфетти. */
export function VictoryBurst() {
  const burst = Array.from({ length: 40 });
  const confetti = Array.from({ length: 36 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Золотая вспышка */}
      <motion.div
        initial={{ scale: 0, opacity: 0.9 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,206,107,0.9), transparent 70%)' }}
      />
      {/* Радиальный взрыв из центра */}
      {burst.map((_, i) => {
        const ang = (i / burst.length) * Math.PI * 2;
        const dist = 120 + Math.random() * 90;
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return (
          <motion.span
            key={`b${i}`}
            className="absolute left-1/2 top-1/3 rounded-[1px]"
            style={{ width: 4, height: 9, background: c }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + 20, opacity: 0, rotate: Math.random() * 540 }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: Math.random() * 0.15 }}
          />
        );
      })}
      {/* Падающее конфетти сверху */}
      {confetti.map((_, i) => {
        const left = Math.random() * 100;
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const delay = Math.random() * 0.6;
        return (
          <motion.span
            key={`c${i}`}
            className="absolute top-0 rounded-[1px]"
            style={{ left: `${left}%`, width: 5, height: 11, background: c }}
            initial={{ y: -20, opacity: 0, rotate: 0 }}
            animate={{ y: 320, opacity: [0, 1, 1, 0], rotate: Math.random() * 720 - 360 }}
            transition={{ duration: 1.8 + Math.random(), ease: 'easeIn', delay }}
          />
        );
      })}
    </div>
  );
}
