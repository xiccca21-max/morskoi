/** Форматирование чисел/денег в едином стиле приложения (RU). */

import { getActiveCurrency, useCurrencyStore, CURRENCIES } from '../stores/currency-store';

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Целое число с разделителями тысяч: 12345 → «12 345». */
export function formatNumber(value: number): string {
  return nf0.format(Math.round(value || 0));
}

/**
 * Денежная сумма в выбранной пользователем валюте отображения.
 * На вход всегда базовая единица — рубли (как хранится на сервере).
 * Конвертация и символ берутся из активной валюты (currency-store).
 */
export function formatMoney(valueRub: number): string {
  const c = getActiveCurrency();
  const converted = (valueRub || 0) / c.rubPerUnit;
  const num = (c.decimals === 2 ? nf2 : nf0).format(converted);
  return c.symbolAfter ? `${num}\u00A0${c.symbol}` : `${c.symbol}${num}`;
}

/**
 * Хук-форматтер: возвращает formatMoney и пересобирается при смене валюты,
 * чтобы компоненты, использующие его, перерисовывались мгновенно.
 */
export function useMoney(): (valueRub: number) => string {
  // подписка на валюту — гарантирует ре-рендер при переключении
  useCurrencyStore((s) => s.currency);
  return formatMoney;
}

/** Текущий символ активной валюты (для подписей у полей ввода и т.п.). */
export function currencySymbol(): string {
  return getActiveCurrency().symbol;
}

/** Компактное число для тесных мест: 1500 → «1.5k». */
export function formatCompact(value: number): string {
  const v = value || 0;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/** Компактная сумма в активной валюте (без символа) — для тесной навигации. */
export function formatCompactMoney(valueRub: number): string {
  const c = getActiveCurrency();
  return formatCompact((valueRub || 0) / c.rubPerUnit);
}

export { CURRENCIES };
