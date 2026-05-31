/** Округление денежных сумм до копеек — защита от float-дрейфа SQLite. */
export function roundRub(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundPct(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
