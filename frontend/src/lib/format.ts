/** Форматирование чисел/денег в едином стиле приложения (RU). Только рубли (₽). */

import { CURRENCIES } from '../stores/currency-store';

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** Целое число с разделителями тысяч: 12345 → «12 345». */
export function formatNumber(value: number): string {
  return nf0.format(Math.round(value || 0));
}

/** Денежная сумма в рублях: 1500 → «1 500 ₽». */
export function formatMoney(valueRub: number): string {
  return `${nf0.format(Math.round(valueRub || 0))}\u00A0₽`;
}

/** Хук-форматтер (совместимость): возвращает formatMoney. */
export function useMoney(): (valueRub: number) => string {
  return formatMoney;
}

/** Символ валюты — всегда ₽. */
export function currencySymbol(): string {
  return '₽';
}

/** Знаков после запятой — всегда 0. */
export function currencyDecimals(): 0 | 2 {
  return 0;
}

/** Рубли → единицы для поля ввода (1:1). */
export function rubToUnit(valueRub: number): number {
  return Math.round(valueRub || 0);
}

/** Единицы поля ввода → рубли (1:1). */
export function unitToRub(valueUnit: number): number {
  return Math.round(valueUnit || 0);
}

/** Пресеты пополнения в рублях. */
export function depositPresets(): { unit: number; rub: number }[] {
  return [100, 500, 1000, 5000].map((v) => ({ unit: v, rub: v }));
}

/** Компактное число: 1500 → «1.5k». */
export function formatCompact(value: number): string {
  const v = value || 0;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/** Компактная сумма без символа — для тесной навигации. */
export function formatCompactMoney(valueRub: number): string {
  return formatCompact(valueRub || 0);
}

/** Пресеты ставок (₽), отфильтрованные по min/max с сервера. */
export function wagerPresetsRub(min: number, max: number): number[] {
  return [100, 250, 500, 1000, 5000].filter((p) => p >= min && p <= max);
}

export { CURRENCIES };
