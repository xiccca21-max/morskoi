import { create } from 'zustand';

export interface User {
  id: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  balance: number;
  withdrawable?: number;
  wins: number;
  losses: number;
  draws?: number;
  referralCount?: number;
  agreedToTerms?: boolean;
  dailyDepositLimit?: number;
  selfExcludedUntil?: string | null;
  createdAt?: string;
}

interface AuthState {
  ready: boolean;
  authenticated: boolean;
  user: User | null;
  setUser: (u: User | null) => void;
  patchUser: (p: Partial<User>) => void;
  setReady: (v: boolean) => void;
  updateBalance: (b: number) => void;
  updateWallet: (w: { balance: number; withdrawable: number }) => void;
  applyMatchResult: (won: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  user: null,
  setUser: (u) => set({ user: u, authenticated: !!u }),
  patchUser: (p) => set((s) => (s.user ? { user: { ...s.user, ...p } } : {})),
  setReady: (v) => set({ ready: v }),
  updateBalance: (b) => set((s) => (s.user ? { user: { ...s.user, balance: b } } : {})),
  updateWallet: (w) => set((s) => (s.user ? { user: { ...s.user, balance: w.balance, withdrawable: w.withdrawable } } : {})),
  applyMatchResult: (won) =>
    set((s) =>
      s.user
        ? {
            user: {
              ...s.user,
              wins: s.user.wins + (won ? 1 : 0),
              losses: s.user.losses + (won ? 0 : 1),
            },
          }
        : {},
    ),
}));
