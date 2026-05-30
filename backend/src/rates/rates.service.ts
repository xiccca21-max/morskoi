import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Живые курсы для валюты отображения (Вариант А).
 * Базовая единица — рубль. Значения = «сколько рублей в 1 единице валюты».
 *   USDT  — реальный курс USDT→RUB (CoinGecko), обновляется по расписанию.
 *   STARS — производное от курса USD по ориентировочной цене 1 Star.
 * При недоступности источника отдаём последний кэш или фолбэк.
 */
const FALLBACK = { RUB: 1, USDT: 95, STARS: 1.9 };
// Ориентировочная розничная цена 1 Telegram Star в USD (у Stars нет биржевого курса).
const STAR_USD = Number(process.env.STAR_USD || 0.02);
const SOURCE =
  'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub';

@Injectable()
export class RatesService implements OnModuleInit {
  private readonly logger = new Logger('Rates');
  private rates = { ...FALLBACK, ts: 0, live: false };

  async onModuleInit() {
    await this.refresh();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async refresh() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(SOURCE, { signal: ctrl.signal });
      const json: any = await res.json();
      const usdtRub = Number(json?.tether?.rub);
      if (usdtRub && usdtRub > 0) {
        this.rates = {
          RUB: 1,
          USDT: +usdtRub.toFixed(4),
          STARS: +(usdtRub * STAR_USD).toFixed(4),
          ts: Date.now(),
          live: true,
        };
        this.logger.log(`rates updated: 1 USDT = ${usdtRub} ₽`);
      }
    } catch (e: any) {
      this.logger.warn(`rates refresh failed: ${e?.message || e}`);
    } finally {
      clearTimeout(t);
    }
  }

  get() {
    return this.rates;
  }
}
