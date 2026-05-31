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
  // Базовый адрес Bot API. По умолчанию api.telegram.org, но если провайдер
  // его блокирует (частый случай в РФ) — задайте TELEGRAM_API_ROOT с адресом
  // прокси-релея (например, Cloudflare Worker), который форвардит на Telegram.
  private readonly apiRoot = (
    process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org'
  ).replace(/\/+$/, '');

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
    if (this.apiRoot !== 'https://api.telegram.org') {
      this.logger.log(`Telegram API root overridden → ${this.apiRoot}`);
    }
    if (webhookUrl) {
      this.bot = new TelegramBot(token, { polling: false, baseApiUrl: this.apiRoot });
      // Секрет для проверки входящих апдейтов (заголовок X-Telegram-Bot-Api-Secret-Token).
      this.webhookSecret =
        process.env.TELEGRAM_WEBHOOK_SECRET ||
        createHash('sha256').update(token).digest('hex').slice(0, 48);
      // Регистрируем webhook напрямую через Bot API, чтобы передать secret_token и allowed_updates.
      await fetch(`${this.apiRoot}/bot${token}/setWebhook`, {
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
      this.bot = new TelegramBot(token, { polling: false, baseApiUrl: this.apiRoot });
      this.logger.log('Bot created without polling (TELEGRAM_BOT_POLLING=false)');
    } else {
      // Снимаем возможный старый webhook, иначе getUpdates вернёт 409 Conflict.
      await fetch(`${this.apiRoot}/bot${token}/deleteWebhook`, {
        method: 'POST',
      }).catch(() => undefined);
      // Короткий long-polling таймаут: через прокси (Cloudflare Worker) длинные
      // висящие соединения рвутся с "socket hang up". 10с — баланс стабильности.
      this.bot = new TelegramBot(token, {
        baseApiUrl: this.apiRoot,
        polling: {
          interval: 1000,
          params: { timeout: 10 },
        },
      });
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
      await fetch(`${this.apiRoot}/bot${token}/setChatMenuButton`, {
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
        '💰 Делай ставки от 100 ₽ и забирай выигрыш\n' +
        '🏆 Расти в звании: от Юнги до Адмирала\n\n' +
        'Выбирай действие кнопками ниже 👇';
      const keyboard = this.mainReplyKeyboard(launchUrl);
      try {
        await this.bot!.sendPhoto(msg.chat.id, photoUrl, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } catch {
        await this.bot!.sendMessage(msg.chat.id, caption, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
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
        const r = await fetch(`${this.apiRoot}/bot${token}/${method}`, {
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
        { command: 'invite', description: '🔗 Пригласить друга' },
      ],
    });
  }

  /** Тексты кнопок reply-клавиатуры (должны совпадать с mainReplyKeyboard). */
  private static readonly BTN = {
    PLAY: '⚔️ В бой',
    BALANCE: '💰 Баланс',
    TOP: '🏆 Рейтинг',
    PROFILE: '👤 Профиль',
    INFO: 'ℹ️ Информация',
    SUPPORT: '🆘 Поддержка',
  } as const;

  /**
   * Постоянная клавиатура под полем ввода (ReplyKeyboardMarkup).
   * «В бой» открывает мини-приложение; остальные — текстовые команды.
   */
  private mainReplyKeyboard(launchUrl?: string): TelegramBot.ReplyKeyboardMarkup {
    const url = launchUrl ?? process.env.TELEGRAM_WEBAPP_URL ?? 'https://example.com';
    const { BTN } = TelegramBotService;
    return {
      keyboard: [
        [{ text: BTN.PLAY, web_app: { url } }],
        [{ text: BTN.BALANCE }, { text: BTN.TOP }],
        [{ text: BTN.PROFILE }, { text: BTN.INFO }],
        [{ text: BTN.SUPPORT }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  private replyOpts(launchUrl?: string): { reply_markup: TelegramBot.ReplyKeyboardMarkup } {
    return { reply_markup: this.mainReplyKeyboard(launchUrl) };
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
    const supportUrl = process.env.SUPPORT_URL ?? process.env.VITE_SUPPORT_URL;
    const { BTN } = TelegramBotService;
    const kb = () => this.replyOpts();

    const sendBalance = async (chatId: number, tgId: string) => {
      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажми «⚔️ В бой», чтобы создать аккаунт.', kb());
        return;
      }
      const balance = Number(user.balance).toLocaleString('ru-RU');
      const withdrawable = Number((user as any).withdrawable ?? 0).toLocaleString('ru-RU');
      await bot.sendMessage(
        chatId,
        `💰 <b>Баланс</b>\n\nВсего: <b>${balance} ₽</b>\nМожно вывести: <b>${withdrawable} ₽</b>\n\nПополнение и вывод USDT — в разделе «Казна» в игре.`,
        { parse_mode: 'HTML', ...kb() },
      );
    };

    const sendTop = async (chatId: number) => {
      const top = await this.prisma.user.findMany({
        where: { wins: { gt: 0 } },
        orderBy: [{ wins: 'desc' }],
        take: 10,
      });
      if (top.length === 0) {
        await bot.sendMessage(chatId, '🏆 Рейтинг пока пуст. Стань первым капитаном!', kb());
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((u, i) => {
        const place = medals[i] ?? `${i + 1}.`;
        const name = (u as any).nickname || u.firstName || u.username || 'Капитан';
        return `${place} <b>${this.escapeHtml(name)}</b> — ${u.wins} побед`;
      });
      await bot.sendMessage(chatId, `🏆 <b>Топ капитанов</b>\n\n${lines.join('\n')}`, {
        parse_mode: 'HTML',
        ...kb(),
      });
    };

    const sendProfile = async (chatId: number, tgId: string) => {
      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажми «⚔️ В бой», чтобы создать аккаунт.', kb());
        return;
      }
      const name = (user as any).nickname || user.firstName || user.username || 'Капитан';
      const total = user.wins + user.losses;
      const wr = total ? Math.round((user.wins / total) * 100) : 0;
      const streak = (user as any).loginStreak ?? 0;
      await bot.sendMessage(
        chatId,
        `👤 <b>Профиль — ${this.escapeHtml(name)}</b>\n\n` +
          `🏆 Побед: <b>${user.wins}</b> · 💀 Поражений: <b>${user.losses}</b>\n` +
          `🎯 Точность: <b>${wr}%</b>\n` +
          (streak > 0 ? `🔥 Стрик входа: <b>${streak}</b> дн.\n` : '') +
          `👥 Приглашено друзей: <b>${(user as any).referralCount ?? 0}</b>\n` +
          `\nОткрой игру, чтобы сменить ник и посмотреть достижения.`,
        { parse_mode: 'HTML', ...kb() },
      );
    };

    const sendInfo = async (chatId: number) => {
      const text =
        'ℹ️ <b>Информация</b>\n\n' +
        '⚓ PvP «Морской Бой» на ставки от <b>100 ₽</b>\n' +
        '• Победитель забирает 95% банка\n' +
        '• Вывод USDT — от 100 ₽, до 24 ч\n' +
        '• Бонусы можно играть, но не выводить\n\n' +
        '📜 <b>Правила:</b>\n' +
        '• Флот: 1×4, 2×3, 3×2, 4×1 — корабли не соприкасаются\n' +
        '• Попадание = ещё один выстрел\n' +
        '• Пропуск хода или выход = поражение\n\n' +
        '18+. Играй ответственно.';
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...kb() });
    };

    const sendSupport = async (chatId: number) => {
      const link = supportUrl
        ? `\n\n<a href="${this.escapeHtml(supportUrl)}">💬 Написать в поддержку</a>`
        : '';
      await bot.sendMessage(
        chatId,
        '🆘 <b>Поддержка</b>\n\nВопросы по игре, пополнению или выводу — напиши нам.' + link,
        { parse_mode: 'HTML', ...kb(), disable_web_page_preview: true },
      );
    };

    bot.onText(/^\/play\b/, async (msg) => {
      await bot.sendMessage(msg.chat.id, '⚔️ Нажми «⚔️ В бой» на клавиатуре ниже — откроется игра!', kb());
    });

    bot.onText(/^\/balance\b/, async (msg) => {
      await sendBalance(msg.chat.id, String(msg.from?.id ?? msg.chat.id));
    });

    bot.onText(/^\/stats\b/, async (msg) => {
      await sendProfile(msg.chat.id, String(msg.from?.id ?? msg.chat.id));
    });

    bot.onText(/^\/top\b/, async (msg) => {
      await sendTop(msg.chat.id);
    });

    bot.onText(/^\/rules\b/, async (msg) => {
      await sendInfo(msg.chat.id);
    });

    bot.onText(/^\/support\b/, async (msg) => {
      await sendSupport(msg.chat.id);
    });

    bot.onText(/^\/invite\b/, async (msg) => {
      const tgId = String(msg.from?.id ?? msg.chat.id);
      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      const botName = process.env.TELEGRAM_BOT_USERNAME ?? 'NavalClashBot';
      if (!user) {
        await bot.sendMessage(msg.chat.id, 'Сначала нажми «⚔️ В бой», чтобы создать аккаунт.', kb());
        return;
      }
      const bonus = Number(process.env.REFERRAL_BONUS ?? 25);
      const link = `https://t.me/${botName}?start=ref_${user.id}`;
      await bot.sendMessage(
        msg.chat.id,
        `🔗 <b>Пригласи друга</b>\n\n` +
          `Твоя ссылка:\n<code>${link}</code>\n\n` +
          `За каждого нового игрока — <b>+${bonus} ₽</b>.\n` +
          `Приглашено: <b>${(user as any).referralCount ?? 0}</b>`,
        { parse_mode: 'HTML', ...kb() },
      );
    });

    bot.onText(/^\/help\b/, async (msg) => {
      const text =
        'ℹ️ <b>Помощь</b>\n\n' +
        'Используй кнопки под полем ввода:\n\n' +
        `• <b>${BTN.PLAY}</b> — открыть игру\n` +
        `• <b>${BTN.BALANCE}</b> — баланс и вывод\n` +
        `• <b>${BTN.TOP}</b> — рейтинг капитанов\n` +
        `• <b>${BTN.PROFILE}</b> — твоя статистика\n` +
        `• <b>${BTN.INFO}</b> — правила и лимиты\n` +
        `• <b>${BTN.SUPPORT}</b> — связь с поддержкой`;
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML', ...kb() });
    });

    const KNOWN = /^\/(start|play|balance|stats|top|rules|support|help|invite)\b/;
    bot.on('message', async (msg) => {
      if (msg.chat.type !== 'private') return;
      const text = msg.text?.trim();
      if (!text) return;
      if (text.startsWith('/')) {
        if (KNOWN.test(text)) return;
        await bot.sendMessage(msg.chat.id, 'Не знаю такой команды 🤔 Нажми /help или кнопку ниже.', kb());
        return;
      }

      const tgId = String(msg.from?.id ?? msg.chat.id);

      switch (text) {
        case BTN.BALANCE:
          await sendBalance(msg.chat.id, tgId);
          return;
        case BTN.TOP:
          await sendTop(msg.chat.id);
          return;
        case BTN.PROFILE:
          await sendProfile(msg.chat.id, tgId);
          return;
        case BTN.INFO:
          await sendInfo(msg.chat.id);
          return;
        case BTN.SUPPORT:
          await sendSupport(msg.chat.id);
          return;
        default:
          break;
      }

      if (text.startsWith('https://t.me/') && text.includes('start=ref_')) {
        await bot.sendMessage(msg.chat.id, 'Это реферальная ссылка — отправь её другу, не себе 🙂', kb());
        return;
      }

      switch (text) {
        default:
          await bot.sendMessage(
            msg.chat.id,
            '⚓ Выбери действие на клавиатуре ниже или нажми «⚔️ В бой», чтобы играть!',
            kb(),
          );
      }
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  }

  async notify(telegramId: string, text: string, withPlay = false) {
    if (!this.bot) return;
    const url = process.env.TELEGRAM_WEBAPP_URL;
    try {
      await this.bot.sendMessage(Number(telegramId), text, {
        parse_mode: 'HTML',
        ...(withPlay && url
          ? { reply_markup: { inline_keyboard: [[{ text: '⚔️ К бою', web_app: { url } }]] } }
          : {}),
      });
    } catch (e: any) {
      this.logger.warn(`notify ${telegramId} failed: ${e?.message}`);
    }
  }

  async notifyUser(
    userId: string,
    text: string,
    opts?: { withPlay?: boolean; pref?: 'matchFound' | 'payout' | 'rematch' | 'referral' },
  ) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } }) as any;
    if (!u) return;
    if (opts?.pref === 'matchFound' && u.notifyMatchFound === false) return;
    if (opts?.pref === 'payout' && u.notifyPayout === false) return;
    if (opts?.pref === 'rematch' && u.notifyRematch === false) return;
    if (opts?.pref === 'referral' && u.notifyReferral === false) return;
    await this.notify(u.telegramId, text, opts?.withPlay);
  }

  async notifyMatchFound(p1Id: string, p2Id: string, wager: number) {
    const sec = Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60);
    const text = `⚔️ Соперник найден! Ставка: ${wager} ₽. Открой игру и расставь корабли (${sec} сек).`;
    await Promise.all([
      this.notifyUser(p1Id, text, { withPlay: true, pref: 'matchFound' }),
      this.notifyUser(p2Id, text, { withPlay: true, pref: 'matchFound' }),
    ]);
  }

  async notifyPayout(userId: string, amount: number) {
    await this.notifyUser(userId, `🏆 Победа! Выплата: ${amount.toFixed(0)} ₽`, { withPlay: true, pref: 'payout' });
  }

  async notifyDeposit(userId: string, amount: number) {
    await this.notifyUser(userId, `✅ Баланс пополнен на ${amount.toFixed(0)} ₽. Удачи в бою!`);
  }

  async notifyWithdrawal(userId: string, amount: number, status: 'paid' | 'rejected', note?: string) {
    if (status === 'paid') {
      await this.notifyUser(userId, `💸 Вывод ${amount.toFixed(0)} ₽ (USDT) отправлен на ваш кошелёк.`, { pref: 'payout' });
    } else {
      await this.notifyUser(userId, `↩️ Заявка на вывод отклонена${note ? `: ${note}` : ''}. Средства возвращены на баланс.`);
    }
  }

  async notifyRematch(opponentId: string, requesterId: string) {
    const req = await this.prisma.user.findUnique({ where: { id: requesterId } });
    const name = req?.username ?? req?.firstName ?? 'Соперник';
    await this.notifyUser(
      opponentId,
      `🔄 <b>${name}</b> предлагает реванш! Открой игру и нажми «Реванш».`,
      { withPlay: true, pref: 'rematch' },
    );
  }

  /** Отправить файл админу (off-site бэкап). */
  async sendDocument(telegramId: string, filePath: string, caption?: string) {
    if (!this.bot) return;
    try {
      await this.bot.sendDocument(Number(telegramId), filePath, {
        caption: caption?.slice(0, 1024),
        parse_mode: 'HTML',
      });
    } catch (e: any) {
      this.logger.warn(`sendDocument ${telegramId} failed: ${e?.message}`);
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
