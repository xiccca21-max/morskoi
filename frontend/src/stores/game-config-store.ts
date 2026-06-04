import { create } from 'zustand';

export interface GameConfig {
  minWager: number;
  maxWager: number;
  minWithdraw: number;
  placementTimeoutSec: number;
  turnTimeoutSec: number;
  mmFlexWaitSec: number;
  mmFlexPct: number;
}

const DEFAULTS: GameConfig = {
  minWager: 100,
  maxWager: 10_000,
  minWithdraw: 1000,
  placementTimeoutSec: 60,
  turnTimeoutSec: 20,
  mmFlexWaitSec: 30,
  mmFlexPct: 0.1,
};

interface GameConfigState extends GameConfig {
  loaded: boolean;
  apply: (c: Partial<GameConfig>) => void;
}

export const useGameConfigStore = create<GameConfigState>((set) => ({
  ...DEFAULTS,
  loaded: false,
  apply: (c) => set({ ...c, loaded: true }),
}));

export function getGameConfig(): GameConfig {
  const s = useGameConfigStore.getState();
  return {
    minWager: s.minWager,
    maxWager: s.maxWager,
    minWithdraw: s.minWithdraw,
    placementTimeoutSec: s.placementTimeoutSec,
    turnTimeoutSec: s.turnTimeoutSec,
    mmFlexWaitSec: s.mmFlexWaitSec,
    mmFlexPct: s.mmFlexPct,
  };
}
