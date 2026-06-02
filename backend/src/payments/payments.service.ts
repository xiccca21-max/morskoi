import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CryptoPayService } from './crypto-pay.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { AuditService } from '../common/audit.service';
import { roundRub } from '../common/money';
import { assertCanPlay } from '../common/responsible-gaming';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly cryptoPay: CryptoPayService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotService,
    private readonly audit: AuditService,
  ) {}

  get provider() {
    return this.cryptoPay.isEnabled ? 'cryptobot' : 'none';
  }

  /** Пополнение через @CryptoBot: счёт в ₽, оплата криптой. Без демо-режима. */
  async createDeposit(userId: string, amountRub: number) {
    if (amountRub <= 0) throw new BadRequestException('Сумма должна быть положительной');

    await assertCanPlay(this.prisma, userId);

    if (!this.cryptoPay.isEnabled) {
      throw new ServiceUnavailableException(
        'Пополнение недоступно: на сервере не задан CRYPTO_PAY_TOKEN.',
      );
    }

    const amount = roundRub(amountRub);
    const returnUrl = process.env.TELEGRAM_WEBAPP_URL;
    const { invoiceId, payUrl, miniAppInvoiceUrl, botInvoiceUrl } = await this.cryptoPay.createInvoice({
      amountRub: amount,
      payload: userId,
      returnUrl,
    });
    await this.wallet.createPendingDeposit(userId, amount, invoiceId, 'cryptobot');
    this.logger.log(`Invoice ${invoiceId} created for user ${userId} (${amount} ₽)`);
    return {
      mode: 'cryptobot' as const,
      payUrl,
      invoiceUrl: miniAppInvoiceUrl ?? botInvoiceUrl ?? payUrl,
      miniAppInvoiceUrl,
      botInvoiceUrl,
      invoiceId,
      amountRub: amount,
    };
  }

  async handleCryptoWebhook(rawBody: string, signature?: string) {
    if (!this.cryptoPay.verifyWebhook(rawBody, signature)) {
      throw new BadRequestException('Invalid signature');
    }
    let update: any;
    try {
      update = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Bad payload');
    }
    if (update?.update_type !== 'invoice_paid') return { ok: true, ignored: true };

    const inv = update.payload;
    const userId: string = inv?.payload;
    const invoiceId = String(inv?.invoice_id);
    if (!userId || !invoiceId) return { ok: true, ignored: true };

    await assertCanPlay(this.prisma, userId);

    const r = await this.wallet.completeDepositByInvoice(userId, invoiceId);
    if (r.credited && r.amountRub != null) {
      this.logger.log(`Deposit credited: user=${userId} invoice=${invoiceId} +${r.amountRub} ₽`);
      this.bot.notifyDeposit?.(userId, r.amountRub).catch(() => {});
    }
    return { ok: true };
  }

  async processWithdrawal(id: string, action: 'pay' | 'reject', note?: string) {
    const wr = await this.wallet.getWithdrawal(id);
    if (!wr) throw new NotFoundException('Заявка не найдена');
    if (wr.status === 'PAID' || wr.status === 'REJECTED') {
      throw new BadRequestException('Заявка уже обработана');
    }

    if (action === 'reject') {
      const res = await this.wallet.resolveWithdrawal(id, 'REJECTED', note);
      this.audit.log(wr.userId, 'WITHDRAW_REJECTED', { id, amount: wr.amount, note });
      this.bot.notifyWithdrawal?.(wr.userId, wr.amount, 'rejected', note).catch(() => {});
      return res;
    }

    // USDT на внешний кошелёк — выплата вручную админом на wr.destination (не через Telegram transfer).
    if (String(wr.method).startsWith('USDT_')) {
      this.logger.warn(
        `Manual USDT payout required: ${wr.net} ₽ → ${wr.destination} (${wr.method}) id=${id}`,
      );
      const res = await this.wallet.resolveWithdrawal(id, 'PAID');
      this.audit.log(wr.userId, 'WITHDRAW_PAID', { id, net: wr.net, method: wr.method, manual: true });
      this.bot.notifyWithdrawal?.(wr.userId, wr.net, 'paid').catch(() => {});
      return res;
    }

    if (this.cryptoPay.isEnabled && (wr.method === 'TON' || wr.method === 'CRYPTO')) {
      const asset = wr.method === 'TON' ? 'TON' : 'USDT';
      const user = await this.prisma.user.findUnique({ where: { id: wr.userId } });
      if (!user) throw new NotFoundException('Пользователь не найден');
      const rubPerAsset = await this.cryptoPay.getRubPerAsset(asset);
      const amountAsset = wr.net / rubPerAsset;
      const res = await this.wallet.resolveWithdrawal(id, 'PAID');
      try {
        await this.cryptoPay.transfer({
          telegramUserId: user.telegramId,
          asset,
          amount: amountAsset,
          spendId: `wd_${wr.id}`,
          comment: 'Вывод · Морской Бой',
        });
      } catch (e: any) {
        this.logger.error(`Transfer failed after PAID mark ${id}: ${e?.message}`);
        throw e;
      }
      this.audit.log(wr.userId, 'WITHDRAW_PAID', { id, net: wr.net, method: wr.method });
      this.bot.notifyWithdrawal?.(wr.userId, wr.net, 'paid').catch(() => {});
      return res;
    }

    const res = await this.wallet.resolveWithdrawal(id, 'PAID');
    this.audit.log(wr.userId, 'WITHDRAW_PAID', { id, net: wr.net, method: wr.method });
    this.bot.notifyWithdrawal?.(wr.userId, wr.net, 'paid').catch(() => {});
    return res;
  }
}
