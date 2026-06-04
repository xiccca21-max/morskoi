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

export const useMatchStore = create<MatchStoreState>((set) => ({
  state: null,
  // Сервер шлёт полный авторитетный снимок матча после каждого хода/таймаута/хода бота.
  // Раньше здесь стоял дедуп по matchId/status/gameStatus/winnerId — но за весь бой
  // эти поля не меняются, поэтому обновления currentTurn, turnDeadline, выстрелов и
  // потопленных кораблей терялись (поле «зависало», таймер врал, ходы бота не отражались).
  // Снимки приходят по одному сокет-соединению в правильном порядке, поэтому просто
  // применяем последний.
  setState: (s) => set({ state: s }),
  lastAttack: null,
  setLastAttack: (a) => set({ lastAttack: a }),
  clear: () => set({ state: null, lastAttack: null }),
}));
