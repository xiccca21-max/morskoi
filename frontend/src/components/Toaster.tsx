import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore, ToastKind } from '../stores/toast-store';
import { Icon, IconName } from './Icon';

const DEFAULT_ICON: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'skull',
  info: 'anchor',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-2 inset-x-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto w-full max-w-sm card px-4 py-3 flex items-center gap-3 shadow-lg"
          >
            <span
              className={[
                'shrink-0',
                t.kind === 'error' ? 'text-danger' : t.kind === 'success' ? 'text-main' : 'text-muted',
              ].join(' ')}
            >
              <Icon name={t.icon ?? DEFAULT_ICON[t.kind]} size={18} />
            </span>
            <span className="text-main text-sm flex-1">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
