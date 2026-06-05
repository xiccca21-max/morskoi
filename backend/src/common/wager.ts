import { BadRequestException } from '@nestjs/common';

/** Нормализация ставки — те же правила, что в matchmaking HTTP API. */
export function normalizeWager(amount: unknown): number {
  const min = Number(process.env.MIN_WAGER ?? 100);
  // MAX_WAGER=0 означает «без верхнего лимита» (ограничение — баланс игрока).
  const maxEnv = Number(process.env.MAX_WAGER ?? 0);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('Invalid wager amount');
  }
  const rounded = Math.round(n);
  if (rounded < min) {
    throw new BadRequestException(`Wager must be at least ${min}`);
  }
  if (maxEnv > 0 && rounded > maxEnv) {
    throw new BadRequestException(`Wager must not exceed ${maxEnv}`);
  }
  return rounded;
}
