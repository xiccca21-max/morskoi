import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';

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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-16 h-16 rounded-2xl bg-panel border border-line flex items-center justify-center text-main"
      >
        <Icon name="anchor" size={30} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="title text-2xl mt-6 text-main"
      >
        Морской Бой
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="text-muted text-sm mt-1"
      >
        Дуэль капитанов на ставку
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-12 flex items-center gap-2 text-muted"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
        <span className="eyebrow">{ready ? 'Готово' : 'Загрузка'}</span>
      </motion.div>
    </div>
  );
}
