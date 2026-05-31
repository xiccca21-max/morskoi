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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-base/95 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="text-center px-8"
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
              className="mx-auto w-24 h-24 rounded-full bg-danger/15 border-4 border-danger flex items-center justify-center mb-5"
            >
              <Icon name="swords" size={44} className="text-danger" />
            </motion.div>
            <p className="font-display text-2xl text-main tracking-wide">Соперник найден!</p>
            {wager != null && (
              <p className="text-muted text-sm mt-2">Ставка {formatMoney(wager)}</p>
            )}
            <p className="text-muted text-xs mt-4 animate-pulse">Расставляем флот…</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
