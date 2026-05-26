import { create } from 'zustand';

export interface User {
  id: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  balance: number;
  wins: number;
  losses: number;
  draws?: number;
}

interface AuthState {
  ready: boolean;
  authenticated: boolean;
  user: User | null;
  setUser: (u: User | null) => void;
  setReady: (v: boolean) => void;
  updateBalance: (b: number) => void;
  applyMatchResult: (won: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  user: null,
  setUser: (u) => set({ user: u, authenticated: !!u }),
  setReady: (v) => set({ ready: v }),
  updateBalance: (b) => set((s) => (s.user ? { user: { ...s.user, balance: b } } : {})),
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
