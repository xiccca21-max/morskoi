import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, IconName } from './Icon';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  icon?: IconName;
  children: ReactNode;
  /** Закрывать по клику на фон. По умолчанию да. */
  dismissable?: boolean;
}

export function Modal({ open, onClose, title, icon, children, dismissable = true }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => dismissable && onClose?.()}
          />
          <motion.div
            className="relative w-full max-w-sm card p-5 z-10"
            initial={{ y: 30, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {(title || icon) && (
              <div className="flex items-center gap-2 mb-3">
                {icon && <Icon name={icon} size={20} className="text-danger" />}
                {title && <h3 className="title text-main text-base leading-none">{title}</h3>}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconName;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  icon = 'flag',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} icon={icon} dismissable={!busy}>
      <div className="text-main text-sm leading-relaxed mb-5">{message}</div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? '…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
