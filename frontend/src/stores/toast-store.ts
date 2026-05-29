import { create } from 'zustand';
import type { IconName } from '../components/Icon';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  icon?: IconName;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 2600);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Хелпер для вызова тоста из любого места. */
export function toast(message: string, kind: ToastKind = 'info', icon?: IconName) {
  useToastStore.getState().push({ message, kind, icon });
}
