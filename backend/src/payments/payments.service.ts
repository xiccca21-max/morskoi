import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CryptoPayService } from './crypto-pay.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly cryptoPay: CryptoPayService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotService,
  ) {}

  get provider() {
    return this.cryptoPay.isEnabled ? 'cryptobot' : 'demo';
  }

  /**
   * Создать депозит. Если провайдер подключён — возвращаем ссылку на оплату.
   * Иначе (демо-режим) — сразу зачисляем условные средства.
   */
  async createDeposit(userId: string, amountRub: number) {
    if (amountRub <= 0) throw new BadRequestException('Сумма должна быть положительной');

    if (!this.cryptoPay.isEnabled) {
      const balance = await this.wallet.deposit(userId, amountRub, { source: 'demo' }, true);
      return { mode: 'demo' as const, credited: true, balance };
    }

    const returnUrl = process.env.TELEGRAM_WEBAPP_URL;
    const { invoiceId, payUrl } = await this.cryptoPay.createInvoice({
      amountRub,
      payload: userId,
      returnUrl,
    });
    await this.wallet.createPendingDeposit(userId, amountRub, invoiceId, 'cryptobot');
    this.logger.log(`Invoice ${invoiceId} created for user ${userId} (${amountRub} ₽)`);
    return { mode: 'cryptobot' as const, payUrl, invoiceId };
  }

  /** Обработка вебхука Crypto Pay (оплата инвойса). */
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
    // amount в фиате (RUB), т.к. инвойс фиатный
    const amountRub = Number(inv?.amount ?? inv?.paid_amount ?? 0);
    if (!userId || !invoiceId || amountRub <= 0) return { ok: true, ignored: true };

    const r = await this.wallet.completeDepositByInvoice(userId, invoiceId, amountRub);
    if (r.credited) {
      this.logger.log(`Deposit credited: user=${userId} invoice=${invoiceId} +${amountRub} ₽`);
      this.bot.notifyDeposit?.(userId, amountRub).catch(() => {});
    }
    return { ok: true };
  }

  /**
   * Обработать заявку на вывод: выплатить через Crypto Pay (transfer) и пометить PAID,
   * либо отклонить с возвратом средств.
   */
  async processWithdrawal(id: string, action: 'pay' | 'reject', note?: string) {
    const wr = await this.wallet.getWithdrawal(id);
    if (!wr) throw new NotFoundException('Заявка не найдена');
    if (wr.status === 'PAID' || wr.status === 'REJECTED') {
      throw new BadRequestException('Заявка уже обработана');
    }

    if (action === 'reject') {
      const res = await this.wallet.resolveWithdrawal(id, 'REJECTED', note);
      this.bot.notifyWithdrawal?.(wr.userId, wr.amount, 'rejected', note).catch(() => {});
      return res;
    }

    // action === 'pay'
    if (this.cryptoPay.isEnabled && (wr.method === 'TON' || wr.method === 'CRYPTO')) {
      const asset = wr.method === 'TON' ? 'TON' : 'USDT';
      const user = await this.prisma.user.findUnique({ where: { id: wr.userId } });
      if (!user) throw new NotFoundException('Пользователь не найден');
      const rubPerAsset = await this.cryptoPay.getRubPerAsset(asset);
      const amountAsset = wr.net / rubPerAsset;
      await this.cryptoPay.transfer({
        telegramUserId: user.telegramId,
        asset,
        amount: amountAsset,
        spendId: `wd_${wr.id}`,
        comment: 'Вывод · Морской Бой',
      });
    }
    // Для CARD или демо — считаем выплаченной вручную
    const res = await this.wallet.resolveWithdrawal(id, 'PAID');
    this.bot.notifyWithdrawal?.(wr.userId, wr.net, 'paid').catch(() => {});
    return res;
  }
}
