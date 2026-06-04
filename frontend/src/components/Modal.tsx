import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Icon, IconName } from './Icon';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  icon?: IconName;
  children: ReactNode;
  /** Закрывать по клику на фон. По умолчанию да. */
  dismissable?: boolean;
  /** Доп. отступ снизу на мобильных — приподнимает модалку над краем экрана. */
  raised?: boolean;
}

export function Modal({ open, onClose, title, icon, children, dismissable = true, raised = false }: ModalProps) {
  // Без AnimatePresence/exit: при подтверждении мы закрываем модалку и тут же
  // переходим на /placement — exit-анимация на размонтируемом дереве роняла
  // "Failed to execute 'removeChild'" → экран боя падал с error boundary.
  if (!open) return null;
  return (
    <motion.div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 ${raised ? 'pb-24 sm:pb-4' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => dismissable && onClose?.()}
      />
      <motion.div
        className="relative w-full max-w-sm card p-5 z-10 max-h-[85vh] overflow-y-auto"
        initial={{ y: 30, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
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
          {busy ? (
            <span
              role="status"
              aria-label="Загрузка"
              className="inline-block w-[18px] h-[18px] rounded-full border-2 border-white/40 border-t-white animate-spin align-[-3px]"
            />
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </Modal>
  );
}
