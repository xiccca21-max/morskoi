import { create } from 'zustand';
export const useMatchStore = create((set) => ({
    state: null,
    setState: (s) => set({ state: s }),
    lastAttack: null,
    setLastAttack: (a) => set({ lastAttack: a }),
}));
