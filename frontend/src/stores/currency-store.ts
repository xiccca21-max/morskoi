import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Валюта отображения (Вариант А — косметика поверх базовой единицы).
 * Все суммы хранятся на сервере в рублях (₽). Здесь мы лишь конвертируем
 * их в выбранную валюту для показа. Игровые ставки и пополнения по-прежнему
 * рассчитываются в рублях — это «игровая/расчётная» валюта.
 */
export type CurrencyCode = 'RUB' | 'USDT' | 'STARS';

export interface CurrencyDef {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Сколько рублей в одной единице валюты (для конвертации base₽ → unit). */
  rubPerUnit: number;
  /** Кол-во знаков после запятой при отображении. */
  decimals: 0 | 2;
  /** Символ ставится после числа (true) или перед (false). */
  symbolAfter: boolean;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  RUB: { code: 'RUB', name: 'Рубль', symbol: '₽', rubPerUnit: 1, decimals: 0, symbolAfter: true },
  USDT: { code: 'USDT', name: 'USDT', symbol: '$', rubPerUnit: 95, decimals: 2, symbolAfter: false },
  STARS: { code: 'STARS', name: 'Stars', symbol: '⭐', rubPerUnit: 1.9, decimals: 0, symbolAfter: true },
};


export const CURRENCY_LIST = Object.values(CURRENCIES);

interface CurrencyState {
  currency: CurrencyCode;
  /** Растёт при обновлении живых курсов — чтобы форматтеры пересчитались. */
  ratesVersion: number;
  setCurrency: (c: CurrencyCode) => void;
  applyLiveRates: (rates: { USDT?: number; STARS?: number }) => void;
}

// Модульная копия активной валюты — чтобы format.ts мог читать её синхронно,
// без React-контекста (форматтеры вызываются и вне компонентов).
let active: CurrencyCode = 'RUB';
try {
  const raw = JSON.parse(localStorage.getItem('currency-storage') || '{}');
  if (raw?.state?.currency && CURRENCIES[raw.state.currency as CurrencyCode]) {
    active = raw.state.currency;
  }
} catch {
  /* ignore */
}

export function getActiveCurrency(): CurrencyDef {
  return CURRENCIES[active];
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      currency: active,
      ratesVersion: 0,
      setCurrency: (currency) => {
        active = currency;
        set({ currency });
      },
      applyLiveRates: (rates) => {
        let changed = false;
        if (rates.USDT && rates.USDT > 0) { CURRENCIES.USDT.rubPerUnit = rates.USDT; changed = true; }
        if (rates.STARS && rates.STARS > 0) { CURRENCIES.STARS.rubPerUnit = rates.STARS; changed = true; }
        if (changed) set({ ratesVersion: get().ratesVersion + 1 });
      },
    }),
    {
      name: 'currency-storage',
      // курсы не персистим — только выбранную валюту
      partialize: (s) => ({ currency: s.currency }),
    },
  ),
);
