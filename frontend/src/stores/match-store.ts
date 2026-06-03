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
  clear: () => void;
}

function sameMatch(a: MatchState | null, b: MatchState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.matchId === b.matchId &&
    a.status === b.status &&
    a.gameStatus === b.gameStatus &&
    a.winnerId === b.winnerId
  );
}

export const useMatchStore = create<MatchStoreState>((set) => ({
  state: null,
  setState: (s) =>
    set((prev) => (sameMatch(prev.state, s) ? prev : { state: s })),
  lastAttack: null,
  setLastAttack: (a) => set({ lastAttack: a }),
  clear: () => set({ state: null, lastAttack: null }),
}));
