/** Валюта отображения — только рубли (₽). Мульти-валютность убрана. */
import { create } from 'zustand';

export type CurrencyCode = 'RUB';

export interface CurrencyDef {
  code: CurrencyCode;
  name: string;
  symbol: string;
  rubPerUnit: number;
  decimals: 0 | 2;
  symbolAfter: boolean;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  RUB: { code: 'RUB', name: 'Рубль', symbol: '₽', rubPerUnit: 1, decimals: 0, symbolAfter: true },
};

export const CURRENCY_LIST = Object.values(CURRENCIES);

export function getActiveCurrency(): CurrencyDef {
  return CURRENCIES.RUB;
}

interface CurrencyState {
  currency: CurrencyCode;
  ratesVersion: number;
  setCurrency: (c: CurrencyCode) => void;
  applyLiveRates: (rates: { USDT?: number; STARS?: number }) => void;
}

export const useCurrencyStore = create<CurrencyState>()(() => ({
  currency: 'RUB' as CurrencyCode,
  ratesVersion: 0,
  setCurrency: () => {},
  applyLiveRates: () => {},
}));
