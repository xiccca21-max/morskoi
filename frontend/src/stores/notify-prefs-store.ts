import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotifyPrefs {
  matchFound: boolean;
  payout: boolean;
  rematch: boolean;
  referral: boolean;
  set: (k: keyof Omit<NotifyPrefs, 'set'>, v: boolean) => void;
}

export const useNotifyPrefsStore = create<NotifyPrefs>()(
  persist(
    (set) => ({
      matchFound: true,
      payout: true,
      rematch: true,
      referral: true,
      set: (k, v) => set({ [k]: v }),
    }),
    { name: 'notify-prefs' },
  ),
);

const API_KEYS = {
  matchFound: 'notifyMatchFound',
  payout: 'notifyPayout',
  rematch: 'notifyRematch',
  referral: 'notifyReferral',
} as const;

/** Подтянуть настройки с сервера после логина. */
export function syncNotifyFromServer(user: Partial<Record<'notifyMatchFound' | 'notifyPayout' | 'notifyRematch' | 'notifyReferral', boolean>>) {
  const s = useNotifyPrefsStore.getState();
  if (user.notifyMatchFound != null) s.set('matchFound', user.notifyMatchFound);
  if (user.notifyPayout != null) s.set('payout', user.notifyPayout);
  if (user.notifyRematch != null) s.set('rematch', user.notifyRematch);
  if (user.notifyReferral != null) s.set('referral', user.notifyReferral);
}

export async function saveNotifyPref(k: keyof typeof API_KEYS, v: boolean) {
  useNotifyPrefsStore.getState().set(k, v);
  const { UsersAPI } = await import('../api/endpoints');
  await UsersAPI.setNotify({ [API_KEYS[k]]: v });
}
