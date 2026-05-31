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
