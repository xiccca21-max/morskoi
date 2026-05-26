import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { ready, authenticated } = useAuthStore();

  useEffect(() => {
    if (ready && authenticated) {
      const t = setTimeout(() => navigate('/home'), 900);
      return () => clearTimeout(t);
    }
  }, [ready, authenticated, navigate]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative w-44 h-44 rounded-full border-2 border-cyber-cyan/60 flex items-center justify-center shadow-glow"
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 70%, rgba(34,211,238,0.35) 88%, transparent 100%)',
            animation: 'radarSweep 2.4s linear infinite',
          }}
        />
        <span className="font-display text-5xl">⚓</span>
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="font-display text-3xl mt-8 tracking-[0.4em] text-cyber-cyan"
      >
        NAVAL CLASH
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-white/60 mt-2"
      >
        PvP Морской бой со ставками
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="text-cyber-cyan/80 text-xs mt-12 animate-pulse"
      >
        {ready ? 'Готово…' : 'Соединение с фронтом…'}
      </motion.p>
    </div>
  );
}
