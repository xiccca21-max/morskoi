import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import TelegramBot from 'node-telegram-bot-api';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../common/presence.service';
import type { AdminAlertService } from '../common/admin-alert.service';
import type { LobbyService } from '../matchmaking/lobby.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly presence: PresenceService,
  ) {}

  /** Лениво — без circular import bot ↔ admin-alerts. */
  private get adminAlerts(): AdminAlertService {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdminAlertService: Svc } = require('../common/admin-alert.service') as typeof import('../common/admin-alert.service');
    return this.moduleRef.get(Svc, { strict: false });
  }

  /** Лениво — без circular import файлов bot ↔ lobby. */
  private get lobbies(): LobbyService {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LobbyService: LS } = require('../matchmaking/lobby.service') as typeof import('../matchmaking/lobby.service');
    return this.moduleRef.get(LS, { strict: false });
  }

  /**
   * Передаёт апдейт от Telegram боту (используется webhook-контроллером).
   * Возвращает false, если секрет не совпал или бот не инициализирован.
   */
  processUpdate(update: unknown, secret?: string): boolean {
    if (!this.bot) return false;
    if (!this.webhookSecret) {
      this.logger.warn('webhook update rejected: secret not configured');
      return false;
    }
    const a = Buffer.from(String(secret ?? ''));
    const b = Buffer.from(this.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
    if (webhookUrl && /ТВОЯ-ДОМЕН|YOUR-DOMAIN|example\.com/i.test(webhookUrl)) {
      this.logger.error(
        `TELEGRAM_WEBHOOK_URL содержит плейсхолдер (${webhookUrl}) — бот не получает апдейты! ` +
          'Задай https://game.navalclash.ru/api/telegram/webhook',
      );
    }
    if (this.apiRoot !== 'https://api.telegram.org') {
      this.logger.log(`Telegram API root overridden → ${this.apiRoot}`);
    }
    if (webhookUrl) {
      this.bot = new TelegramBot(token, { polling: false, baseApiUrl: this.apiRoot });
      // Секрет для проверки входящих апдейтов (заголовок X-Telegram-Bot-Api-Secret-Token).
      // В проде обязателен явный TELEGRAM_WEBHOOK_SECRET (проверяется в main.ts).
      // Вывод из токена оставлен только как dev-fallback — при утечке токена он предсказуем.
      if (process.env.TELEGRAM_WEBHOOK_SECRET) {
        this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      } else {
        this.webhookSecret = createHash('sha256').update(token).digest('hex').slice(0, 48);
        this.logger.warn(
          'TELEGRAM_WEBHOOK_SECRET не задан — секрет выведен из токена (небезопасно, только для dev)',
        );
      }
      // Регистрируем webhook напрямую через Bot API, чтобы передать secret_token и allowed_updates.
      await fetch(`${this.apiRoot}/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: this.webhookSecret,
          allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result'],
          drop_pending_updates: false,
        }),
      })
        .then((r) => r.json())
        .then((r: any) => {
          if (r.ok) {
            this.logger.log(
              `Bot started with webhook → ${webhookUrl} (updates: message, callback_query, inline_query)`,
            );
          } else {
            this.logger.warn(`setWebhook failed: ${JSON.stringify(r)}`);
          }
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
        '👥 С другом — тренировка или дуэль: кнопка «Игра с другом»\n' +
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

    // Остальные команды: /play, /balance, /rules, /support, /help, /duel
    this.registerCommands();
    this.registerCallbacks();
    // Inline-режим (@bot duel) и групповые команды (/duel, /top)
    this.registerInline();
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
        { command: 'duel', description: '⚓ Вызвать друга на бой' },
        { command: 'friends', description: '👥 Как играть с другом' },
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
    CHALLENGE: '⚓ Вызвать друга',
    FRIENDS: '👥 Игра с другом',
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
        [{ text: BTN.CHALLENGE }, { text: BTN.FRIENDS }],
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

  /** Полная инструкция: все способы сыграть с другом. */
  private playWithFriendGuideText(): string {
    const bot = this.botUsername;
    const min = Number(process.env.MIN_WAGER ?? 100);
    return (
      '👥 <b>Как сыграть с другом</b>\n\n' +
      'Есть <b>5 способов</b> — выбирай удобный:\n\n' +
      '🎯 <b>1. Тренировка (бесплатно)</b>\n' +
      'Без ставки — только практика, баланс не меняется.\n' +
      '• В игре: Палуба → «Тренировка» → отправь ссылку\n' +
      '• В боте: кнопка «🎯 Тренировка» ниже или /duel → тренировка\n\n' +
      '💰 <b>2. Дуэль на ставку (через бота)</b>\n' +
      '• «⚓ Вызвать друга» или /duel → выбери сумму от ' +
      `${min} ₽\n` +
      '• «📨 Отправить другу» — он откроет лобби одним тапом\n' +
      '• Оба расставляют корабли → бой → победитель забирает банк\n\n' +
      '💬 <b>3. Вызов в личном чате (inline)</b>\n' +
      'В переписке с другом набери:\n' +
      `<code>@${bot} duel</code>\n` +
      'Выбери карточку «Вызвать на морской бой» и отправь ему.\n\n' +
      '👥 <b>4. Вызов в группе</b>\n' +
      'Добавь бота в группу и напиши:\n' +
      '<code>/duel</code> — вызов для всех\n' +
      '<code>/duel @ник</code> — персональный вызов\n' +
      'Бот пришлёт кнопку «Принять вызов».\n\n' +
      '🎮 <b>5. Через игру (лобби)</b>\n' +
      '• «⚔️ В бой» → вкладка «С другом»\n' +
      '• Создай лобби или введи код друга\n' +
      '• На экране лобби — «Отправить» / «Копировать ссылку»\n\n' +
      '━━━━━━━━━━━━━━━━\n' +
      '📋 <b>Как проходит бой</b>\n' +
      '1️⃣ Оба расставляют флот (вручную или авто)\n' +
      '2️⃣ По очереди стреляете — попадание = ещё выстрел\n' +
      '3️⃣ Кто первым потопил весь флот — победил\n\n' +
      '⚠️ <b>Важно:</b> на ставку деньги списываются только когда оба готовы к бою. ' +
      'Пропуск ходов или выход = поражение.'
    );
  }

  private friendGuideKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '🎯 Создать тренировку', callback_data: 'duel_training' }],
        [{ text: '⚓ Дуэль на ставку', callback_data: 'duel_pick_wager' }],
      ],
    };
  }

  private async sendPlayWithFriendGuide(chatId: number) {
    if (!this.bot) return;
    await this.bot.sendMessage(chatId, this.playWithFriendGuideText(), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: this.friendGuideKeyboard(),
    });
  }

  /** Регистрация обработчиков команд бота. */
  private registerCommands() {
    if (!this.bot) return;
    const bot = this.bot;
    const supportUrl = process.env.SUPPORT_URL ?? process.env.VITE_SUPPORT_URL ?? 'https://t.me/Naval_pay_manager';
    const { BTN } = TelegramBotService;
    const kb = () => this.replyOpts();

    const sendBalance = async (chatId: number, tgId: string) => {
      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажми «⚔️ В бой», чтобы создать аккаунт.', kb());
        return;
      }
      const balance = Number(user.balance).toLocaleString('ru-RU');
      await bot.sendMessage(
        chatId,
        `💰 <b>Баланс</b>\n\n<b>${balance} ₽</b> — весь баланс доступен к выводу.\n\nПополнение и вывод USDT — в разделе «Казна» в игре.`,
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
          (streak > 0 ? `📅 Стрик входа: <b>${streak}</b> дн.\n` : '') +
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
        '• С другом: тренировка бесплатно или дуэль — /friends\n\n' +
        '📜 <b>Правила:</b>\n' +
        '• Флот: 1×4, 2×3, 3×2, 4×1 — корабли не соприкасаются\n' +
        '• Попадание = ещё один выстрел\n' +
        '• Пропуск хода или выход = поражение\n\n' +
        '18+. Играй ответственно.';
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...kb() });
    };

    const sendSupport = async (chatId: number) => {
      const handle = supportUrl.replace(/^https?:\/\/t\.me\//, '@');
      await bot.sendMessage(
        chatId,
        '🆘 <b>Поддержка</b>\n\n' +
          'Вопросы по игре, пополнению или выводу — пиши напрямую:\n' +
          `<b>${this.escapeHtml(handle)}</b>`,
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[{ text: '💬 Написать в поддержку', url: supportUrl }]],
          },
        },
      );
    };

    bot.onText(/^\/duel\b/, async (msg) => {
      // В группе — карточка-вызов в чат; в личке — готовый текст для пересылки.
      if (msg.chat.type !== 'private') {
        await this.handleGroupDuel(msg);
        return;
      }
      await this.sendDuelInvite(msg.chat.id, String(msg.from?.id ?? msg.chat.id));
    });

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
      if (msg.chat.type !== 'private') {
        await this.sendGroupTop(msg);
        return;
      }
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
      const link = `https://t.me/${botName}?start=ref_${user.id}`;
      await bot.sendMessage(
        msg.chat.id,
        `🔗 <b>Пригласи друга</b>\n\n` +
          `Реферальная ссылка:\n<code>${link}</code>\n\n` +
          `За приглашённых — косметика и титулы.\n` +
          `Приглашено: <b>${(user as any).referralCount ?? 0}</b>\n\n` +
          `Для дуэли: /duel или «⚓ Вызвать друга». Все способы — /friends`,
        { parse_mode: 'HTML', ...kb() },
      );
    });

    bot.onText(/^\/friends\b/, async (msg) => {
      await this.sendPlayWithFriendGuide(msg.chat.id);
    });

    bot.onText(/^\/admin(?:@\w+)?(?:\s+(\w+))?\b/, async (msg, match) => {
      const tgId = String(msg.from?.id ?? msg.chat.id);
      if (!this.adminAlerts.isAdminTelegramId(tgId)) {
        await bot.sendMessage(
          msg.chat.id,
          `⛔ Команда только для администратора.\n\n` +
            `Твой TG ID: <code>${tgId}</code>\n` +
            `Добавь его в ADMIN_TELEGRAM_ID на сервере, если это ты.`,
          { parse_mode: 'HTML' },
        );
        return;
      }
      const sub = (match?.[1] ?? '').toLowerCase();
      if (sub === 'test') {
        const r = await this.adminAlerts.sendTest(tgId);
        await bot.sendMessage(
          msg.chat.id,
          r.ok ? '✅ Тест отправлен — проверь личку с ботом.' : `❌ ${r.error}`,
        );
        return;
      }
      const st = this.adminAlerts.status();
      const onlineIds = await this.presence.listOnlineUserIds();
      let onlineHumans = onlineIds.length;
      if (onlineIds.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: onlineIds } },
          select: { id: true, telegramId: true },
        });
        onlineHumans = users.filter((u) => !u.telegramId.startsWith('bot:')).length;
      }
      const botName = process.env.TELEGRAM_BOT_USERNAME ?? 'игровой бот';
      const panelUrl = process.env.TELEGRAM_WEBAPP_URL
        ? `${process.env.TELEGRAM_WEBAPP_URL.replace(/\/+$/, '')}/admin.html`
        : null;
      await bot.sendMessage(
        msg.chat.id,
        `🛡 <b>Админ-мониторинг</b>\n\n` +
          `🔔 Уведомления: <b>${st.enabled ? 'включены' : 'выключены'}</b>\n` +
          `📱 ID админа: <code>${st.adminIds.join(', ') || 'не задан'}</code>\n` +
          `🤖 Бот: <b>@${botName}</b>\n` +
          `👥 Онлайн: <b>${onlineHumans}</b>\n\n` +
          `Уведомления приходят в личку <b>игрового бота</b>, не в @Naval_pay_manager.\n\n` +
          `Проверка: /admin test\n\n` +
          (panelUrl ? `🌐 <a href="${panelUrl}">Веб-админка</a>` : ''),
        { parse_mode: 'HTML', disable_web_page_preview: true, ...kb() },
      );
    });

    bot.onText(/^\/help\b/, async (msg) => {
      const text =
        'ℹ️ <b>Помощь</b>\n\n' +
        'Используй кнопки под полем ввода:\n\n' +
        `• <b>${BTN.PLAY}</b> — открыть игру\n` +
        `• <b>${BTN.CHALLENGE}</b> — дуэль на ставку (/duel)\n` +
        `• <b>${BTN.FRIENDS}</b> — как играть с другом (/friends)\n` +
        `• <b>${BTN.BALANCE}</b> — баланс и вывод\n` +
        `• <b>${BTN.TOP}</b> — рейтинг капитанов\n` +
        `• <b>${BTN.PROFILE}</b> — твоя статистика\n` +
        `• <b>${BTN.INFO}</b> — правила и лимиты\n` +
        `• <b>${BTN.SUPPORT}</b> — связь с поддержкой\n\n` +
        'Команды: /duel /friends /balance /stats /top /invite';
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML', ...kb() });
    });

    const KNOWN = /^\/(start|duel|friends|play|balance|stats|top|rules|support|help|invite|admin)\b/;
    const unknown = async (chatId: number) => {
      await bot.sendMessage(
        chatId,
        '🤔 <b>Неизвестная команда.</b>\n\n' +
          'Чтобы посмотреть список доступных команд, отправьте /help — ' +
          'или воспользуйтесь кнопками ниже.',
        { parse_mode: 'HTML', ...kb() },
      );
    };

    bot.on('message', async (msg) => {
      if (msg.chat.type !== 'private') return;
      const text = msg.text?.trim();
      if (!text) return;
      if (text.startsWith('/')) {
        if (KNOWN.test(text)) return;
        await unknown(msg.chat.id);
        return;
      }

      const tgId = String(msg.from?.id ?? msg.chat.id);

      // Фолбэк: если inline не сработал и юзер отправил «@bot duel» обычным сообщением.
      const botUser = this.botUsername.toLowerCase();
      const inlineLike = text.toLowerCase();
      if (
        inlineLike.includes(`@${botUser}`) &&
        (inlineLike.includes('duel') || inlineLike.includes('вызов') || inlineLike.includes('бой'))
      ) {
        await this.sendDuelInvite(msg.chat.id, tgId);
        return;
      }

      switch (text) {
        case BTN.CHALLENGE:
          await this.sendDuelInvite(msg.chat.id, tgId);
          return;
        case BTN.FRIENDS:
          await this.sendPlayWithFriendGuide(msg.chat.id);
          return;
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

      await unknown(msg.chat.id);
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  }

  private get botUsername(): string {
    return process.env.TELEGRAM_BOT_USERNAME ?? 'NavalClashBot';
  }

  /** Ссылка в мини-апп: друг сразу попадает в лобби. */
  private lobbyInviteUrl(code: string): string {
    return `https://t.me/${this.botUsername}?startapp=lobby_${code}`;
  }

  /** Deep-link вызова (legacy) — перенаправляем на открытое лобби хоста. */
  private challengeLink(userId: string): string {
    return `https://t.me/${this.botUsername}?startapp=challenge_${userId}`;
  }

  /** Готовый текст вызова для пересылки в личку/группу/канал. */
  private challengeText(link: string): string {
    return `Я вызываю тебя на морской бой ⚓\nСыграй против меня: ${link}`;
  }

  /** Шаринг без inline-режима — открывает «Выберите чат» в Telegram. */
  private shareUrl(url: string, text: string): string {
    return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  }

  /**
   * /duel — выбор ставки → создаётся лобби → ссылка startapp=lobby_CODE
   * (друг по ссылке сразу в лобби, без лишних экранов).
   */
  private async sendDuelInvite(chatId: number, tgId: string) {
    if (!this.bot) return;
    const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
    if (!user) {
      await this.bot.sendMessage(chatId, 'Сначала нажми «⚔️ В бой», чтобы создать аккаунт.', this.replyOpts());
      return;
    }
    const min = Number(process.env.MIN_WAGER ?? 100);
    const presets = [min, 250, 500, 1000].filter((v, i, a) => a.indexOf(v) === i);
    await this.bot.sendMessage(
      chatId,
      '⚓ <b>Вызов на морской бой</b>\n\n' +
        'Выбери ставку — создам лобби и дам ссылку другу.\n' +
        'Или «🎯 Тренировка» — бесплатно, без ставки.\n\n' +
        'Все способы игры с другом: /friends',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 Тренировка (бесплатно)', callback_data: 'duel_training' }],
            presets.slice(0, 2).map((w) => ({ text: `${w} ₽`, callback_data: `duel_wager_${w}` })),
            presets.slice(2, 4).map((w) => ({ text: `${w} ₽`, callback_data: `duel_wager_${w}` })),
            [{ text: '📖 Полная инструкция', callback_data: 'friends_guide' }],
          ].filter((row) => row.length),
        },
      },
    );
  }

  /** Лобби тренировки готово — ссылка другу. */
  private async sendTrainingLobbyReady(chatId: number, code: string) {
    if (!this.bot) return;
    const url = this.lobbyInviteUrl(code);
    const shareText = 'Тренировочный морской бой ⚓\nБез ставки — нажми и зайди в лобби:';
    await this.bot.sendMessage(
      chatId,
      '✅ <b>Тренировка готова</b>\n\n' +
        'Отправь ссылку другу — он сразу попадёт в лобби.\n' +
        'Баланс и статистика не меняются.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📨 Отправить другу', url: this.shareUrl(url, shareText) }],
            [{ text: '🎮 Открыть лобби', url }],
          ],
        },
      },
    );
  }

  /** После выбора ставки — лобби готово, шлём ссылку другу. */
  private async sendLobbyReady(chatId: number, code: string, wager: number) {
    if (!this.bot) return;
    const url = this.lobbyInviteUrl(code);
    const shareText = `Вызываю на морской бой ⚓\nСтавка ${wager} ₽ — нажми и сразу в лобби:`;
    await this.bot.sendMessage(
      chatId,
      `✅ <b>Лобби готово</b> · ставка <b>${wager} ₽</b>\n\n` +
        'Нажми «📨 Отправить другу» — он откроет лобби одним тапом.\n' +
        'Если не хватит денег — увидит пополнение.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📨 Отправить другу', url: this.shareUrl(url, shareText) }],
            [{ text: '🎮 Открыть своё лобби', url }],
          ],
        },
      },
    );
  }

  private registerCallbacks() {
    if (!this.bot) return;
    this.bot.on('callback_query', async (q: any) => {
      const data = q.data ?? '';
      const chatId = q.message?.chat?.id;
      const tgId = String(q.from?.id ?? '');
      if (!chatId || !tgId) return;

      if (data === 'friends_guide') {
        await this.bot!.answerCallbackQuery({ callback_query_id: q.id });
        await this.sendPlayWithFriendGuide(chatId);
        return;
      }

      if (data === 'duel_pick_wager') {
        await this.bot!.answerCallbackQuery({ callback_query_id: q.id });
        await this.sendDuelInvite(chatId, tgId);
        return;
      }

      if (data === 'duel_training') {
        const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
        if (!user) {
          await this.bot!.answerCallbackQuery({
            callback_query_id: q.id,
            text: 'Сначала нажми «⚔️ В бой» в игре',
            show_alert: true,
          });
          return;
        }
        try {
          const lobby = await this.lobbies.createTraining(user.id);
          await this.bot!.answerCallbackQuery({ callback_query_id: q.id, text: 'Тренировка создана' });
          await this.sendTrainingLobbyReady(chatId, lobby.code);
        } catch (e: any) {
          await this.bot!.answerCallbackQuery({
            callback_query_id: q.id,
            text: e?.message ?? 'Не удалось создать тренировку',
            show_alert: true,
          });
        }
        return;
      }

      if (!data.startsWith('duel_wager_')) return;
      const wager = Number(data.replace('duel_wager_', ''));

      const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        await this.bot!.answerCallbackQuery({
          callback_query_id: q.id,
          text: 'Сначала нажми «⚔️ В бой» в игре',
          show_alert: true,
        });
        return;
      }

      try {
        const lobby = await this.lobbies.create(user.id, wager, false);
        await this.bot!.answerCallbackQuery({ callback_query_id: q.id, text: `Лобби · ${wager} ₽` });
        await this.sendLobbyReady(chatId, lobby.code, wager);
      } catch (e: any) {
        const msg =
          e?.message?.includes('Insufficient') || e?.message?.includes('balance')
            ? 'Недостаточно средств. Пополни баланс в игре.'
            : (e?.response?.message ?? e?.message ?? 'Не удалось создать лобби');
        await this.bot!.answerCallbackQuery({
          callback_query_id: q.id,
          text: msg,
          show_alert: true,
        });
      }
    });
  }

  /**
   * Inline-режим: пользователь в любом чате пишет «@bot duel» и отправляет
   * карточку вызова. ВАЖНО: inline-режим нужно включить в @BotFather
   * (/setinline), иначе Telegram не присылает inline_query.
   */
  private registerInline() {
    if (!this.bot) return;
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    this.bot.on('inline_query', async (q: any) => {
      try {
        this.logger.log(`inline_query from=${q.from?.id} query="${q.query ?? ''}"`);
        const tgId = String(q.from?.id ?? '');
        const user = tgId ? await this.prisma.user.findUnique({ where: { telegramId: tgId } }) : null;
        let link: string;
        if (user) {
          try {
            const open = await this.lobbies.getOpenByHost(user.id);
            link = this.lobbyInviteUrl(open.code);
          } catch {
            const min = Number(process.env.MIN_WAGER ?? 100);
            const lobby = await this.lobbies.create(user.id, min, false);
            link = this.lobbyInviteUrl(lobby.code);
          }
        } else {
          link = `https://t.me/${this.botUsername}?start=play`;
        }
        const text = `Вызываю на морской бой ⚓\nНажми — сразу в лобби:\n${link}`;
        const result = {
          type: 'article',
          id: `duel-${q.id}`,
          title: '⚓ Вызвать на морской бой',
          description: 'Отправь вызов — сыграйте дуэль на ставку',
          input_message_content: { message_text: text, disable_web_page_preview: false },
          reply_markup: { inline_keyboard: [[{ text: '⚔️ Принять вызов', url: link }]] },
        };
        // Прямой вызов API через прокси (надёжнее, чем только node-telegram-bot-api).
        const r = await fetch(`${this.apiRoot}/bot${token}/answerInlineQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inline_query_id: q.id,
            results: [result],
            cache_time: 0,
            is_personal: true,
          }),
        }).then((res) => res.json());
        if (!(r as any).ok) {
          this.logger.warn(`answerInlineQuery failed: ${JSON.stringify(r)}`);
        }
      } catch (e: any) {
        this.logger.warn(`inline_query err: ${e?.message}`);
      }
    });
  }

  /** /duel в группе — постит карточку-вызов в чат (без резолва @username). */
  private async handleGroupDuel(msg: TelegramBot.Message) {
    if (!this.bot) return;
    const tgId = String(msg.from?.id ?? '');
    const caller = tgId ? await this.prisma.user.findUnique({ where: { telegramId: tgId } }) : null;
    if (!caller) {
      await this.bot.sendMessage(
        msg.chat.id,
        'Сначала запусти бота в личке и нажми «⚔️ В бой», чтобы создать аккаунт, затем вызывай в группе.',
      );
      return;
    }
    await this.recordGroupMember(String(msg.chat.id), caller.id, msg.chat.title);

    const callerName = (caller as any).nickname || caller.firstName || caller.username || 'Капитан';
    const target = (msg.text ?? '').replace(/^\/duel(@\S+)?\s*/i, '').trim();
    const who = target ? this.escapeHtml(target) : 'любого смельчака';
    const min = Number(process.env.MIN_WAGER ?? 100);
    try {
      const lobby = await this.lobbies.create(caller.id, min, false);
      const link = this.lobbyInviteUrl(lobby.code);
      await this.bot.sendMessage(
        msg.chat.id,
        `⚓ <b>${this.escapeHtml(callerName)}</b> вызывает ${who} на морской бой!\n` +
          `Ставка <b>${min} ₽</b> — нажми и сразу в лобби 🚢`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⚔️ Принять вызов', url: link }]] },
        },
      );
    } catch (e: any) {
      await this.bot.sendMessage(
        msg.chat.id,
        e?.message?.includes('Insufficient') || e?.message?.includes('balance')
          ? 'Недостаточно средств для дуэли. Пополни баланс в игре.'
          : 'Не удалось создать лобби. Попробуй /duel в личке с ботом.',
      );
    }
  }

  /** /top в группе — рейтинг известных боту игроков этой группы по победам. */
  private async sendGroupTop(msg: TelegramBot.Message) {
    if (!this.bot) return;
    const chatId = String(msg.chat.id);
    // фиксируем вызвавшего как участника
    const tgId = String(msg.from?.id ?? '');
    const caller = tgId ? await this.prisma.user.findUnique({ where: { telegramId: tgId } }) : null;
    if (caller) await this.recordGroupMember(chatId, caller.id, msg.chat.title);

    const members = await (this.prisma as any).groupMember.findMany({
      where: { chatId },
      include: { user: { select: { nickname: true, firstName: true, username: true, wins: true, losses: true } } },
      take: 200,
    });
    const ranked = (members as any[])
      .map((m) => m.user)
      .filter(Boolean)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .slice(0, 10);

    if (!ranked.length) {
      await this.bot.sendMessage(
        msg.chat.id,
        '🏆 В этой группе пока нет известных капитанов.\nНапиши /duel — и пусть начнётся первая дуэль!',
      );
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = ranked.map((u, i) => {
      const place = medals[i] ?? `${i + 1}.`;
      const name = u.nickname || u.firstName || u.username || 'Капитан';
      return `${place} <b>${this.escapeHtml(name)}</b> — ${u.wins} побед`;
    });
    await this.bot.sendMessage(
      msg.chat.id,
      `🏆 <b>Рейтинг группы</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' },
    );
  }

  /** Фиксирует игрока как участника группы (для /top по группе). */
  private async recordGroupMember(chatId: string, userId: string, title?: string) {
    try {
      await (this.prisma as any).groupMember.upsert({
        where: { chatId_userId: { chatId, userId } },
        create: { chatId, userId, title: title ?? null },
        update: { title: title ?? null },
      });
    } catch (e: any) {
      this.logger.warn(`recordGroupMember err: ${e?.message}`);
    }
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
    // Боты — без реального Telegram-чата
    if (typeof u.telegramId === 'string' && u.telegramId.startsWith('bot:')) return;
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

  /** Уведомление вызванному игроку: соперник принял challenge и создал лобби. */
  async notifyChallenge(opponentId: string, fromName: string, wager: number, code: string) {
    if (!this.bot) return;
    const u = await this.prisma.user.findUnique({ where: { id: opponentId } });
    if (!u) return;
    if (typeof u.telegramId === 'string' && u.telegramId.startsWith('bot:')) return;
    const link = `https://t.me/${this.botUsername}?startapp=lobby_${code}`;
    const text =
      `⚓ <b>${this.escapeHtml(fromName)}</b> принял твой вызов!\n` +
      `Ставка: <b>${wager} ₽</b>\n` +
      `Жми «Принять бой» и расставляй корабли 🚢`;
    try {
      await this.bot.sendMessage(Number(u.telegramId), text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⚔️ Принять бой', url: link }]] },
      });
    } catch (e: any) {
      this.logger.warn(`notifyChallenge tgId=${u.telegramId} failed: ${e?.message}`);
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
    if (typeof user.telegramId === 'string' && user.telegramId.startsWith('bot:')) return;
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
