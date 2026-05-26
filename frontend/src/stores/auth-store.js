import { create } from 'zustand';
export const useAuthStore = create((set) => ({
    ready: false,
    authenticated: false,
    user: null,
    setUser: (u) => set({ user: u, authenticated: !!u }),
    setReady: (v) => set({ ready: v }),
    updateBalance: (b) => set((s) => (s.user ? { user: { ...s.user, balance: b } } : {})),
    applyMatchResult: (won) => set((s) => s.user
        ? {
            user: {
                ...s.user,
                wins: s.user.wins + (won ? 1 : 0),
                losses: s.user.losses + (won ? 0 : 1),
            },
        }
        : {}),
}));
