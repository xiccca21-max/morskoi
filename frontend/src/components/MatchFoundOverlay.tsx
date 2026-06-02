import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';
import { formatMoney } from '../lib/format';

interface Props {
  open: boolean;
  wager?: number;
}

export function MatchFoundOverlay({ open, wager }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-base/95 backdrop-blur-md overflow-hidden"
        >
          {/* Глубинный фон */}
          <div className="absolute inset-0 sea-bg opacity-30" />

          {/* Расходящиеся боевые лучи */}
          <motion.div
            className="absolute w-[140vmax] h-[140vmax] pointer-events-none opacity-[0.07]"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(240,75,65,0.9) 0deg 4deg, transparent 4deg 14deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          />

          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="relative text-center px-8"
          >
            {/* Сонарные кольца */}
            <div className="relative mx-auto w-28 h-28 mb-6 flex items-center justify-center">
              {[0, 0.5, 1].map((d) => (
                <motion.span
                  key={d}
                  className="absolute rounded-full border-2 border-danger/50"
                  style={{ width: 88, height: 88 }}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 2.4, opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: d }}
                />
              ))}
              <motion.div
                animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
                className="relative w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 50% 35%, rgba(240,75,65,0.28), rgba(240,75,65,0.08))',
                  border: '4px solid rgb(var(--c-danger-rgb))',
                  boxShadow: '0 0 40px rgba(240,75,65,0.4), inset 0 0 24px rgba(240,75,65,0.2)',
                }}
              >
                <Icon name="swords" size={44} className="text-danger" />
              </motion.div>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="title text-2xl text-main"
            >
              Соперник найден
            </motion.p>

            {wager != null && wager > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 18 }}
                className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full"
                style={{
                  background: 'rgba(212,168,44,0.12)',
                  border: '1px solid rgba(212,168,44,0.4)',
                }}
              >
                <Icon name="coins" size={14} className="text-warning" />
                <span className="font-display text-sm text-main tnum">Ставка {formatMoney(wager)}</span>
              </motion.div>
            )}
            {wager === 0 && (
              <p className="text-muted text-sm mt-3">Тренировка · без ставки</p>
            )}

            <p className="text-muted text-xs mt-5 tracking-[0.2em] uppercase animate-pulse">
              Расставляем флот…
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
