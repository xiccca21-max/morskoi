import { BadRequestException } from '@nestjs/common';

/** Абсолютный потолок ставки (защита от абуза), даже когда MAX_WAGER=0 = «без лимита». */
export const HARD_MAX_WAGER = 1_000_000;

/**
 * Эффективный потолок ставки.
 * MAX_WAGER=0 (или не задан) → «без фиксированного лимита»: ограничение только балансом
 * игрока, но не выше абсолютного потолка HARD_MAX_WAGER.
 */
export function maxWagerCap(): number {
  const maxEnv = Number(process.env.MAX_WAGER ?? 0);
  return maxEnv > 0 ? Math.min(maxEnv, HARD_MAX_WAGER) : HARD_MAX_WAGER;
}

/** Нормализация ставки — те же правила, что в matchmaking HTTP API. */
export function normalizeWager(amount: unknown): number {
  const min = Number(process.env.MIN_WAGER ?? 100);
  const max = maxWagerCap();
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('Invalid wager amount');
  }
  const rounded = Math.round(n);
  if (rounded < min) {
    throw new BadRequestException(`Wager must be at least ${min}`);
  }
  if (rounded > max) {
    throw new BadRequestException(`Wager must not exceed ${max}`);
  }
  return rounded;
}
