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

    // Описание бота — текст на экране «Что умеет этот бот?» (до нажатия «Старт»).
    // ВАЖНО: картинку над этим текстом можно поставить ТОЛЬКО через @BotFather
    // (Edit Bot → Edit Description Picture) — Bot API такого метода не имеет.
    await this.setupBotProfile(token);

    // Устанавливаем кнопку меню «Начать играть» для всех чатов по умолчанию
    const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
    if (webAppUrl) {
      await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: 'Начать играть',
            web_app: { url: webAppUrl },
          },
        }),
      })
        .then((r) => r.json())
        .then((r: any) => {
          if (r.ok) this.logger.log('Menu button set: «Начать играть»');
          else this.logger.warn(`setChatMenuButton failed: ${JSON.stringify(r)}`);
        })
        .catch((e) => this.logger.warn(`setChatMenuButton error: ${e.message}`));
    }

    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      const url = process.env.TELEGRAM_WEBAPP_URL ?? 'https://example.com';
      const param = (match?.[1] ?? '').trim();
      const launchUrl = param ? `${url}?startapp=${encodeURIComponent(param)}` : url;
      const photoUrl = `${url}/bot-welcome.png`;
      const caption =
        '⚓ <b>Naval Clash — морской бой с реальными ставками</b>\n\n' +
        '🚢 Расставь флот, вызови соперника и потопи его корабли\n' +
        '💰 Делай ставки и забирай выигрыш прямо в Telegram\n' +
        '🏆 Расти в звании: от Юнги до Адмирала\n\n' +
        'Нажми кнопку ниже — и в бой! 👇';
      try {
        await this.bot!.sendPhoto(msg.chat.id, photoUrl, {
          caption,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '⚔️ Начать играть', web_app: { url: launchUrl } }]],
          },
        });
      } catch {
        // Фото недоступно — fallback на текстовое сообщение
        await this.bot!.sendMessage(msg.chat.id, caption, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '⚔️ Начать играть', web_app: { url: launchUrl } }]],
          },
        });
      }
    });
  }

  /**
   * Текст на экране «Что умеет этот бот?» (description) и под именем (short description).
   * Картинка/видео над описанием ставится вручную через @BotFather.
   */
  private async setupBotProfile(token: string) {
    const description =
      '⚓ Морской Бой — PvP-дуэль капитанов на реальные ставки прямо в Telegram.\n\n' +
      '🚢 Расставь флот и потопи соперника\n' +
      '💰 Победитель забирает банк (95%)\n' +
      '🏆 Расти в звании: от Юнги до Адмирала\n\n' +
      '18+. Играй ответственно.';
    const shortDescription =
      '⚓ Морской бой на ставки. Потопи соперника и забери банк. 18+';

    const call = async (method: string, body: Record<string, any>) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((res) => res.json());
        if ((r as any).ok) this.logger.log(`${method} ok`);
        else this.logger.warn(`${method} failed: ${JSON.stringify(r)}`);
      } catch (e: any) {
        this.logger.warn(`${method} error: ${e?.message}`);
      }
    };

    await call('setMyDescription', { description });
    await call('setMyShortDescription', { short_description: shortDescription });
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
    const text = `⚔️ Соперник найден! Ставка: ${wager} ₽. Открой Mini App и расставь корабли (30 сек).`;
    await Promise.all([this.notifyUser(p1Id, text), this.notifyUser(p2Id, text)]);
  }

  async notifyPayout(userId: string, amount: number) {
    await this.notifyUser(userId, `🏆 Победа! Выплата: ${amount.toFixed(0)} ₽`);
  }

  async notifyDeposit(userId: string, amount: number) {
    await this.notifyUser(userId, `✅ Баланс пополнен на ${amount.toFixed(0)} ₽. Удачи в бою!`);
  }

  async notifyWithdrawal(userId: string, amount: number, status: 'paid' | 'rejected', note?: string) {
    if (status === 'paid') {
      await this.notifyUser(userId, `💸 Вывод ${amount.toFixed(0)} ₽ выполнен. Проверьте @CryptoBot.`);
    } else {
      await this.notifyUser(userId, `↩️ Заявка на вывод отклонена${note ? `: ${note}` : ''}. Средства возвращены на баланс.`);
    }
  }

  /** Уведомление создателю открытого лобби — кто-то принял его вызов. */
  async notifyLobbyJoined(hostId: string, joinerName: string, wager: number) {
    if (!this.bot) {
      this.logger.warn('notifyLobbyJoined: bot not initialised');
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: hostId } });
    if (!user) {
      this.logger.warn(`notifyLobbyJoined: host ${hostId} not found`);
      return;
    }
    const url = process.env.TELEGRAM_WEBAPP_URL;
    const text =
      `🚢 <b>${joinerName}</b> принял твой вызов!\n` +
      `Ставка: <b>${wager} ₽</b>\n` +
      `Открывай игру и расставляй корабли — бой уже начался!`;
    try {
      await this.bot.sendMessage(Number(user.telegramId), text, {
        parse_mode: 'HTML',
        // Кнопка только если URL мини-приложения настроен
        ...(url
          ? { reply_markup: { inline_keyboard: [[{ text: '🎮 Открыть бой', web_app: { url } }]] } }
          : {}),
      });
      this.logger.log(`notifyLobbyJoined sent to tgId=${user.telegramId}`);
    } catch (e: any) {
      // 403 = пользователь не запускал бота — это нормально
      this.logger.warn(`notifyLobbyJoined tgId=${user.telegramId} failed: ${e?.message}`);
    }
  }
}
