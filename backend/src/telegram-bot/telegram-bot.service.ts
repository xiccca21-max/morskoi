import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TelegramBotService — лёгкий бот:
 *   - /start приветствует и даёт кнопку «Open Mini App»
 *   - метод notify() рассылает игрокам уведомления (match found, payout)
 *
 * Для production включите webhook (TELEGRAM_WEBHOOK_URL). Для dev используется polling.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger('TelegramBot');
  private bot?: TelegramBot;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token.startsWith('123456')) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured — bot disabled');
      return;
    }
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    const pollingDisabled = process.env.TELEGRAM_BOT_POLLING === 'false';
    if (webhookUrl) {
      this.bot = new TelegramBot(token, { polling: false });
      await this.bot.setWebHook(webhookUrl).catch((e) => this.logger.warn(`webhook err: ${e.message}`));
      this.logger.log(`Bot started with webhook → ${webhookUrl}`);
    } else if (pollingDisabled) {
      // Polling выключен (например, провайдер режет api.telegram.org).
      // Mini App всё равно работает — initData валидируется локально по бот-токену.
      this.bot = new TelegramBot(token, { polling: false });
      this.logger.log('Bot created without polling (TELEGRAM_BOT_POLLING=false)');
    } else {
      this.bot = new TelegramBot(token, { polling: true });
      this.logger.log('Bot started with polling');
    }

    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      const url = process.env.TELEGRAM_WEBAPP_URL ?? 'https://example.com';
      const param = (match?.[1] ?? '').trim();
      const launchUrl = param ? `${url}?startapp=${encodeURIComponent(param)}` : url;
      await this.bot!.sendMessage(msg.chat.id, '⚓ Добро пожаловать в Naval Clash!\nPvP «Морской бой» с реальными ставками.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: launchUrl } }]],
        },
      });
    });
  }

  async notify(telegramId: string, text: string) {
    if (!this.bot) return;
    try {
      await this.bot.sendMessage(Number(telegramId), text, { parse_mode: 'HTML' });
    } catch (e: any) {
      this.logger.warn(`notify ${telegramId} failed: ${e?.message}`);
    }
  }

  async notifyUser(userId: string, text: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) return;
    await this.notify(u.telegramId, text);
  }

  async notifyMatchFound(p1Id: string, p2Id: string, wager: number) {
    const text = `⚔ Соперник найден! Ставка: $${wager}. Открой Mini App и расставь корабли (30 сек).`;
    await Promise.all([this.notifyUser(p1Id, text), this.notifyUser(p2Id, text)]);
  }

  async notifyPayout(userId: string, amount: number) {
    await this.notifyUser(userId, `🏆 Победа! Выплата: $${amount.toFixed(2)}`);
  }
}
