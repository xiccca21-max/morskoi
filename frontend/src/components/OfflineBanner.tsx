import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from './Icon';

/** Баннер «нет сети» — реагирует на потерю интернет-соединения устройства. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  // Без AnimatePresence/exit: анимация выхода роняла removeChild в Telegram WebView.
  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 inset-x-0 z-50 bg-danger text-white text-center text-xs flex items-center justify-center gap-2"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))', paddingBottom: '0.5rem' }}
    >
      <Icon name="wave" size={14} />
      Нет подключения к интернету
    </motion.div>
  );
}
