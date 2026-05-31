import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { roundRub } from '../common/money';

/**
 * Crypto Pay API (@CryptoBot). Без CRYPTO_PAY_TOKEN пополнение недоступно.
 */
@Injectable()
export class CryptoPayService {
  private readonly logger = new Logger('CryptoPay');
  private readonly token = process.env.CRYPTO_PAY_TOKEN ?? '';
  private readonly base = process.env.CRYPTO_PAY_API ?? 'https://pay.crypt.bot/api';

  get isEnabled() {
    return this.token.length > 0;
  }

  private async call<T = any>(method: string, body?: Record<string, any>): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Token': this.token,
      },
      body: JSON.stringify(body ?? {}),
    });
    const json: any = await res.json();
    if (!json.ok) {
      this.logger.warn(`${method} failed: ${JSON.stringify(json.error ?? json)}`);
      throw new Error(json.error?.name ?? `crypto-pay ${method} failed`);
    }
    return json.result as T;
  }

  /** Инвойс в USDT (не фиатный RUB). Пользователь платит криптой. */
  async createUsdtInvoice(params: {
    amountUsdt: number;
    payload: string;
    description?: string;
    returnUrl?: string;
  }): Promise<{ invoiceId: string; invoiceUrl: string }> {
    const result = await this.call<any>('createInvoice', {
      asset: 'USDT',
      amount: roundRub(params.amountUsdt).toFixed(2),
      payload: params.payload,
      description: params.description ?? 'Пополнение баланса · Морской Бой',
      paid_btn_name: params.returnUrl ? 'callback' : undefined,
      paid_btn_url: params.returnUrl,
      allow_comments: false,
      expires_in: 3600,
    });
    const invoiceUrl =
      result.mini_app_invoice_url ??
      result.web_app_invoice_url ??
      result.bot_invoice_url ??
      result.pay_url;
    if (!invoiceUrl) throw new Error('Crypto Pay: no invoice URL');
    return { invoiceId: String(result.invoice_id), invoiceUrl };
  }

  /** Сколько ₽ за 1 единицу asset (USDT). */
  async getRubPerAsset(asset: string): Promise<number> {
    const rates = await this.call<any[]>('getExchangeRates');
    const r = rates.find((x) => x.source === asset && x.target === 'RUB');
    if (!r) throw new Error(`Нет курса ${asset}/RUB`);
    return Number(r.rate);
  }

  async transfer(params: {
    telegramUserId: string;
    asset: string;
    amount: number;
    spendId: string;
    comment?: string;
  }): Promise<{ transferId: string }> {
    const result = await this.call<any>('transfer', {
      user_id: Number(params.telegramUserId),
      asset: params.asset,
      amount: params.amount.toFixed(8),
      spend_id: params.spendId,
      comment: params.comment,
    });
    return { transferId: String(result.transfer_id) };
  }

  verifyWebhook(rawBody: string, signature: string | undefined): boolean {
    if (!signature || !this.token) return false;
    const secret = createHash('sha256').update(this.token).digest();
    const hmac = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
