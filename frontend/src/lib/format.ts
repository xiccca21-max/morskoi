/** Форматирование чисел/денег в едином стиле приложения (RU). */

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Целое число с разделителями тысяч: 12345 → «12 345». */
export function formatNumber(value: number): string {
  return nf0.format(Math.round(value || 0));
}

/**
 * Денежная сумма с символом ₽.
 * decimals=auto: целые показываем без копеек, дробные — с двумя знаками.
 */
export function formatMoney(value: number, opts?: { decimals?: 0 | 2 | 'auto' }): string {
  const v = value || 0;
  const mode = opts?.decimals ?? 'auto';
  const useDecimals = mode === 2 || (mode === 'auto' && !Number.isInteger(v));
  return `${(useDecimals ? nf2 : nf0).format(v)}\u00A0₽`;
}

/** Компактное число для тесных мест: 1500 → «1.5k». */
export function formatCompact(value: number): string {
  const v = value || 0;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
