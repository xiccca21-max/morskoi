/** Точное сопоставление JSON в Transaction.meta (без substring contains). */
export function parseTxMeta(meta: string | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const v = JSON.parse(meta);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function txMetaMatches(
  meta: string | null | undefined,
  key: string,
  value: string,
): boolean {
  const obj = parseTxMeta(meta);
  return obj != null && String(obj[key]) === String(value);
}
