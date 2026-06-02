import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { NavalEmblem } from '../components/NavalEmblem';

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
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      {/* Глубинный фон с сонарным «дыханием» */}
      <div className="absolute inset-0 sea-bg opacity-40" />
      <div className="absolute inset-0 sea-sheen opacity-30" />

      {/* Сонарные кольца вокруг герба */}
      <div className="relative flex items-center justify-center">
        {[0, 0.7, 1.4].map((delay) => (
          <motion.span
            key={delay}
            className="absolute rounded-full border border-danger/40"
            style={{ width: 96, height: 96 }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 2.6, opacity: [0.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay }}
          />
        ))}

        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="relative w-24 h-24 rounded-[26px] flex items-center justify-center"
          style={{
            background: 'linear-gradient(150deg, rgba(20,36,72,0.95), rgba(5,10,20,0.95))',
            boxShadow:
              '0 12px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(212,168,44,0.18)',
          }}
        >
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <NavalEmblem size={48} />
          </motion.div>
        </motion.div>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-8 flex flex-col items-center leading-none gap-1"
      >
        <span className="font-display text-[12px] tracking-[0.42em] uppercase text-danger">Морской</span>
        <span className="title text-3xl text-main">Бой</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-muted text-sm mt-3 tracking-wide"
      >
        Дуэль капитанов на ставку
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="absolute bottom-12 flex items-center gap-2 text-muted"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
        <span className="eyebrow">{ready ? 'Готово' : 'Подготовка флота'}</span>
      </motion.div>
    </div>
  );
}
