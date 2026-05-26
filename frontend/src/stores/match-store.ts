import { create } from 'zustand';
import type { MatchState } from '../lib/game-types';

interface MatchStoreState {
  state: MatchState | null;
  setState: (s: MatchState | null) => void;
  lastAttack: {
    by: string;
    x: number;
    y: number;
    hit: boolean;
    sunk?: boolean;
    ts: number;
  } | null;
  setLastAttack: (a: MatchStoreState['lastAttack']) => void;
}

export const useMatchStore = create<MatchStoreState>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
  lastAttack: null,
  setLastAttack: (a) => set({ lastAttack: a }),
}));
