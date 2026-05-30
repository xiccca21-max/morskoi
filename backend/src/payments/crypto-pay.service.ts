import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Клиент Crypto Pay API (@CryptoBot).
 * Документация: https://help.crypt.bot/crypto-pay-api
 *
 * Активируется только при наличии CRYPTO_PAY_TOKEN. Без токена isEnabled=false,
 * и приложение работает в демо-режиме.
 */
@Injectable()
export class CryptoPayService {
  private readonly logger = new Logger('CryptoPay');
  private readonly token = process.env.CRYPTO_PAY_TOKEN ?? '';
  // testnet: https://testnet-pay.crypt.bot/api
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

  /** Создать фиатный инвойс в рублях. Пользователь платит крипто-эквивалент. */
  async createInvoice(params: {
    amountRub: number;
    payload: string;
    description?: string;
    returnUrl?: string;
  }): Promise<{ invoiceId: string; payUrl: string }> {
    const result = await this.call<any>('createInvoice', {
      currency_type: 'fiat',
      fiat: 'RUB',
      amount: params.amountRub.toFixed(2),
      payload: params.payload,
      description: params.description ?? 'Пополнение баланса · Морской Бой',
      paid_btn_name: params.returnUrl ? 'callback' : undefined,
      paid_btn_url: params.returnUrl,
      allow_comments: false,
      expires_in: 3600,
    });
    return {
      invoiceId: String(result.invoice_id),
      payUrl: result.bot_invoice_url ?? result.pay_url ?? result.mini_app_invoice_url,
    };
  }

  /** Курс: сколько RUB за 1 единицу asset (например USDT). */
  async getRubPerAsset(asset: string): Promise<number> {
    const rates = await this.call<any[]>('getExchangeRates');
    const r = rates.find((x) => x.source === asset && x.target === 'RUB');
    if (!r) throw new Error(`Нет курса ${asset}/RUB`);
    return Number(r.rate);
  }

  /** Перевод средств пользователю на его аккаунт в @CryptoBot (по Telegram user_id). */
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

  /**
   * Проверка подписи вебхука. Секрет = SHA256(token), подпись = HMAC-SHA256(rawBody).
   */
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
