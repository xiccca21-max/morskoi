import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { createHash } from 'crypto';
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
  private webhookSecret?: string;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Передаёт апдейт от Telegram боту (используется webhook-контроллером).
   * Возвращает false, если секрет не совпал или бот не инициализирован.
   */
  processUpdate(update: unknown, secret?: string): boolean {
    if (!this.bot) return false;
    if (this.webhookSecret && secret !== this.webhookSecret) {
      this.logger.warn('webhook update rejected: bad secret token');
      return false;
    }
    try {
      this.bot.processUpdate(update as TelegramBot.Update);
      return true;
    } catch (e: any) {
      this.logger.warn(`processUpdate error: ${e?.message}`);
      return false;
    }
  }

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
      // Секрет для проверки входящих апдейтов (заголовок X-Telegram-Bot-Api-Secret-Token).
      this.webhookSecret =
        process.env.TELEGRAM_WEBHOOK_SECRET ||
        createHash('sha256').update(token).digest('hex').slice(0, 48);
      // Регистрируем webhook напрямую через Bot API, чтобы передать secret_token и allowed_updates.
      await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: this.webhookSecret,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: false,
        }),
      })
        .then((r) => r.json())
        .then((r: any) => {
          if (r.ok) this.logger.log(`Bot started with webhook → ${webhookUrl}`);
          else this.logger.warn(`setWebhook failed: ${JSON.stringify(r)}`);
        })
        .catch((e) => this.logger.warn(`webhook err: ${e.message}`));
    } else if (pollingDisabled) {
      // Polling выключен (например, провайдер режет api.telegram.org).
      // Mini App всё равно работает — initData валидируется локально по бот-токену.
      this.bot = new TelegramBot(token, { polling: false });
      this.logger.log('Bot created without polling (TELEGRAM_BOT_POLLING=false)');
    } else {
      // Снимаем возможный старый webhook, иначе getUpdates вернёт 409 Conflict.
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: 'POST',
      }).catch(() => undefined);
      this.bot = new TelegramBot(token, { polling: true });
      this.bot.on('polling_error', (e: any) =>
        this.logger.warn(`polling_error: ${e?.code || ''} ${e?.message || e}`),
      );
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

    // Остальные команды: /play, /balance, /rules, /support, /help
    this.registerCommands();
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

    // Список команд — показывается при вводе «/» и в меню команд.
    await call('setMyCommands', {
      commands: [
        { command: 'start', description: '🚀 Запустить бота' },
        { command: 'play', description: '⚔️ Играть — открыть бой' },
        { command: 'balance', description: '💰 Мой баланс' },
        { command: 'stats', description: '📊 Моя статистика' },
        { command: 'top', description: '🏆 Топ игроков' },
        { command: 'rules', description: '📜 Правила игры' },
        { command: 'support', description: '🆘 Поддержка' },
        { command: 'help', description: 'ℹ️ Помощь и команды' },
      ],
    });
  }

  /** Inline-кнопка «Начать играть», открывающая мини-приложение. */
  private playButton(launchUrl?: string) {
    const url = launchUrl ?? process.env.TELEGRAM_WEBAPP_URL;
    if (!url) return undefined;
    return { inline_keyboard: [[{ text: '⚔️ Начать играть', web_app: { url } }]] };
  }

  /** Регистрация обработчиков команд бота. */
  private registerCommands() {
    if (!this.bot) return;
    const bot = this.bot;
    const url = process.env.TELEGRAM_WEBAPP_URL ?? 'https://example.com';
    const supportUrl = process.env.SUPPORT_URL ?? process.env.VITE_SUPPORT_URL;

    bot.onText(/^\/play\b/, async (msg) => {
      await bot.sendMessage(msg.chat.id, '⚔️ Открывай игру и вызывай соперника на дуэль!', {
        reply_markup: this.playButton(),
      });
    });

    bot.onText(/^\/balance\b/, async (msg) => {
      const tgId = String(msg.from?.id ?? msg.chat.id);
      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        await bot.sendMessage(msg.chat.id, 'Сначала зайди в игру, чтобы создать аккаунт 👇', {
          reply_markup: this.playButton(),
        });
        return;
      }
      const balance = Number(user.balance).toLocaleString('ru-RU');
      const withdrawable = Number((user as any).withdrawable ?? 0).toLocaleString('ru-RU');
      await bot.sendMessage(
        msg.chat.id,
        `💰 <b>Твой баланс</b>\n\nВсего: <b>${balance} ₽</b>\nМожно вывести: <b>${withdrawable} ₽</b>`,
        { parse_mode: 'HTML', reply_markup: this.playButton() },
      );
    });

    bot.onText(/^\/top\b/, async (msg) => {
      const top = await this.prisma.user.findMany({
        where: { wins: { gt: 0 } },
        orderBy: [{ wins: 'desc' }],
        take: 10,
      });
      if (top.length === 0) {
        await bot.sendMessage(msg.chat.id, '🏆 Рейтинг пока пуст. Стань первым капитаном!', {
          reply_markup: this.playButton(),
        });
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((u, i) => {
        const place = medals[i] ?? `${i + 1}.`;
        const name = (u as any).nickname || u.firstName || u.username || 'Капитан';
        return `${place} <b>${this.escapeHtml(name)}</b> — ${u.wins} побед`;
      });
      await bot.sendMessage(msg.chat.id, `🏆 <b>Топ капитанов</b>\n\n${lines.join('\n')}`, {
        parse_mode: 'HTML',
        reply_markup: this.playButton(),
      });
    });

    bot.onText(/^\/rules\b/, async (msg) => {
      const text =
        '📜 <b>Правила «Морского Боя»</b>\n\n' +
        '• Флот: 1×4, 2×3, 3×2, 4×1 — корабли не касаются друг друга.\n' +
        '• Игроки ходят по очереди, попадание даёт право на ещё один выстрел.\n' +
        '• На ход — ограниченное время; пропустишь — ход перейдёт сопернику.\n' +
        '• Кто первым потопит весь флот врага — забирает банк (95%).\n' +
        '• Комиссия платформы — 5%. 18+, играй ответственно.';
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML', reply_markup: this.playButton() });
    });

    bot.onText(/^\/support\b/, async (msg) => {
      const text = '🆘 <b>Поддержка</b>\n\nНапиши нам, если возник вопрос по игре, оплате или выводу.';
      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'HTML',
        reply_markup: supportUrl
          ? { inline_keyboard: [[{ text: '💬 Написать в поддержку', url: supportUrl }]] }
          : undefined,
      });
    });

    bot.onText(/^\/help\b/, async (msg) => {
      const text =
        'ℹ️ <b>Команды бота</b>\n\n' +
        '/play — открыть игру и вызвать соперника\n' +
        '/balance — показать баланс\n' +
        '/rules — правила игры\n' +
        '/support — связаться с поддержкой\n' +
        '/start — главный экран\n\n' +
        'Кнопка <b>«Начать играть»</b> внизу всегда открывает игру.';
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML', reply_markup: this.playButton() });
    });

    // Любое текстовое сообщение, не являющееся командой — вежливый ответ с кнопкой игры.
    const KNOWN = /^\/(start|play|balance|top|rules|support|help)\b/;
    bot.on('message', async (msg) => {
      if (msg.chat.type !== 'private') return; // только в личке
      const text = msg.text?.trim();
      if (!text) return; // не реагируем на фото/стикеры и т.п.
      if (text.startsWith('/')) {
        if (KNOWN.test(text)) return; // известную команду обработает свой хендлер
        await bot.sendMessage(msg.chat.id, 'Не знаю такой команды 🤔 Нажми /help или кнопку ниже.', {
          reply_markup: this.playButton(),
        });
        return;
      }
      await bot.sendMessage(msg.chat.id, '⚓ Готов к бою? Открывай игру и вызывай соперника!', {
        reply_markup: this.playButton(),
      });
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
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
