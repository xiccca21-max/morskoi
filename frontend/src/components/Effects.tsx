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

/** Сдержанный салют при победе — частицы. */
export function VictoryBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 28 }).map((_, i) => {
        const ang = (i / 28) * Math.PI * 2;
        const dist = 110 + Math.random() * 80;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-[1px]"
            style={{ width: 3, height: 8, background: i % 4 === 0 ? '#C8453B' : '#C2C6CD' }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + 30, opacity: 0, rotate: Math.random() * 360 }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: Math.random() * 0.2 }}
          />
        );
      })}
    </div>
  );
}
