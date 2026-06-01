import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

type UserRow = {
  id: string;
  username: string | null;
  firstName: string | null;
  nickname: string | null;
  telegramId: string;
};

/**
 * Рассылает админу в Telegram все значимые события из ActionLog.
 * Получатели: ADMIN_TELEGRAM_ID (можно несколько через запятую).
 */
@Injectable()
export class AdminAlertService {
  private readonly logger = new Logger('AdminAlert');
  private readonly adminIds: string[];
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotService,
  ) {
    const raw = process.env.ADMIN_TELEGRAM_ID ?? '';
    this.adminIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    this.enabled = process.env.ADMIN_ALERT_ENABLED !== 'false' && this.adminIds.length > 0;
  }

  isAdminTelegramId(telegramId: string): boolean {
    return this.adminIds.includes(telegramId);
  }

  /** Прямая отправка (бэкапы и т.п.). */
  async send(text: string) {
    if (!this.enabled) return;
    for (const id of this.adminIds) {
      void this.bot.notify(id, text).catch(() => undefined);
    }
  }

  /** Вызывается из AuditService после записи в БД. */
  notifyAction(userId: string | null | undefined, action: string, meta?: Record<string, unknown>) {
    if (!this.enabled) return;
    void this.dispatch(userId, action, meta).catch((e) => {
      this.logger.warn(`notify ${action} failed: ${e?.message}`);
    });
  }

  private async dispatch(
    userId: string | null | undefined,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    const cache = new Map<string, UserRow | null>();
    const getUser = async (id: string | null | undefined): Promise<UserRow | null> => {
      if (!id) return null;
      if (cache.has(id)) return cache.get(id)!;
      const u = await this.prisma.user.findUnique({ where: { id } });
      cache.set(id, u as UserRow | null);
      return u as UserRow | null;
    };

    const isBot = (u: UserRow | null) => !!u?.telegramId?.startsWith('bot:');

    if (!(await this.shouldNotify(userId, action, meta, getUser, isBot))) return;

    const text = await this.formatMessage(userId, action, meta, getUser);
    if (!text) return;
    for (const id of this.adminIds) {
      await this.bot.notify(id, text);
    }
  }

  private async shouldNotify(
    userId: string | null | undefined,
    action: string,
    meta: Record<string, unknown> | undefined,
    getUser: (id: string | null | undefined) => Promise<UserRow | null>,
    isBot: (u: UserRow | null) => boolean,
  ): Promise<boolean> {
    const actor = await getUser(userId ?? null);
    if (!isBot(actor)) return true;

    if (action.startsWith('MATCH_')) {
      const ids = [
        userId,
        meta?.p2Id as string | undefined,
        meta?.opponentId as string | undefined,
        meta?.winnerId as string | undefined,
        meta?.surrenderedBy as string | undefined,
      ].filter(Boolean) as string[];
      for (const id of ids) {
        const u = await getUser(id);
        if (u && !isBot(u)) return true;
      }
      return false;
    }

    if (action === 'LOBBY_CREATE' || action === 'LOBBY_JOIN') return false;
    return false;
  }

  private async formatMessage(
    userId: string | null | undefined,
    action: string,
    meta: Record<string, unknown> | undefined,
    getUser: (id: string | null | undefined) => Promise<UserRow | null>,
  ): Promise<string | null> {
    const m = meta ?? {};
    const actor = await getUser(userId ?? null);
    const who = this.label(actor, m.username as string | undefined);

    switch (action) {
      case 'LOGIN':
        return (
          `👤 <b>Вход</b>\n` +
          `Игрок: ${who}\n` +
          (m.telegramId ? `TG: <code>${m.telegramId}</code>\n` : '') +
          (userId ? `ID: <code>${userId}</code>` : '')
        );

      case 'REGISTER':
        return (
          `🆕 <b>Новый игрок</b>\n` +
          `Игрок: ${who}\n` +
          (m.telegramId ? `TG: <code>${m.telegramId}</code>\n` : '') +
          (userId ? `ID: <code>${userId}</code>` : '')
        );

      case 'DEPOSIT': {
        const amt = Number(m.amount ?? 0);
        const src = m.source ? ` (${m.source})` : '';
        return `💰 <b>Пополнение</b>${src}\nИгрок: ${who}\nСумма: <b>${amt.toFixed(0)} ₽</b>`;
      }

      case 'WITHDRAW_REQUEST': {
        const net = Number(m.net ?? 0);
        const network = String(m.network ?? (String(m.method ?? '').replace('USDT_', '') || '—'));
        const addr = String(m.address ?? m.destination ?? '—');
        return (
          `💸 <b>Заявка на вывод</b>\n` +
          `Игрок: ${who}\n` +
          `Сумма: <b>${net.toFixed(0)} ₽</b> → USDT\n` +
          `Сеть: <b>${this.esc(network)}</b>\n` +
          `Кошелёк: <code>${this.esc(addr)}</code>\n` +
          (m.id ? `ID: <code>${m.id}</code>` : '')
        );
      }

      case 'WITHDRAW_PAID': {
        const net = Number(m.net ?? 0);
        const manual = m.manual ? ' (вручную)' : '';
        return (
          `✅ <b>Вывод выполнен</b>${manual}\n` +
          `Игрок: ${who}\n` +
          `Сумма: <b>${net.toFixed(0)} ₽</b>\n` +
          (m.id ? `ID: <code>${m.id}</code>` : '')
        );
      }

      case 'WITHDRAW_REJECTED': {
        const amt = Number(m.amount ?? 0);
        return (
          `❌ <b>Вывод отклонён</b>\n` +
          `Игрок: ${who}\n` +
          `Сумма: <b>${amt.toFixed(0)} ₽</b>\n` +
          (m.note ? `Причина: ${this.esc(String(m.note))}\n` : '') +
          (m.id ? `ID: <code>${m.id}</code>` : '')
        );
      }

      case 'QUEUE_JOIN': {
        const wager = Number(m.wagerAmount ?? 0);
        return `🔍 <b>Поиск боя</b>\nИгрок: ${who}\nСтавка: <b>${wager.toFixed(0)} ₽</b>`;
      }

      case 'QUEUE_MATCHED': {
        const wager = Number(m.wagerAmount ?? 0);
        const opp = await getUser(m.opponentId as string | undefined);
        return (
          `🤝 <b>Найден соперник</b>\n` +
          `Игрок: ${who}\n` +
          `Соперник: ${this.label(opp)}\n` +
          `Ставка: <b>${wager.toFixed(0)} ₽</b>\n` +
          (m.matchId ? `Матч: <code>${m.matchId}</code>` : '')
        );
      }

      case 'LOBBY_CREATE': {
        const wager = Number(m.wagerAmount ?? 0);
        const kind = m.isTraining ? 'тренировка' : m.isPublic ? 'публичное' : 'приватное';
        return (
          `📋 <b>Лобби создано</b> (${kind})\n` +
          `Хост: ${who}\n` +
          `Ставка: <b>${wager.toFixed(0)} ₽</b>\n` +
          (m.code ? `Код: <code>${m.code}</code>` : '')
        );
      }

      case 'LOBBY_JOIN': {
        const wager = Number(m.wagerAmount ?? 0);
        const host = await getUser(m.hostId as string | undefined);
        return (
          `⚔️ <b>Вход в лобби</b>\n` +
          `Игрок: ${who}\n` +
          `Хост: ${this.label(host)}\n` +
          `Ставка: <b>${wager.toFixed(0)} ₽</b>\n` +
          (m.code ? `Код: <code>${m.code}</code>` : '') +
          (m.matchId ? `\nМатч: <code>${m.matchId}</code>` : '')
        );
      }

      case 'MATCH_CREATED': {
        const p2 = await getUser(m.p2Id as string | undefined);
        const wager = Number(m.wagerAmount ?? 0);
        const kind = m.isTraining ? '🎯 тренировка' : `💰 ${wager.toFixed(0)} ₽`;
        return (
          `🆚 <b>Матч создан</b>\n` +
          `${this.label(actor)} vs ${this.label(p2)}\n` +
          `${kind}\n` +
          (m.matchId ? `ID: <code>${m.matchId}</code>` : '')
        );
      }

      case 'MATCH_STARTED': {
        const p2 = await getUser(m.p2Id as string | undefined);
        const wager = Number(m.wagerAmount ?? 0);
        const kind = m.isTraining ? '🎯 тренировка' : `💰 ${wager.toFixed(0)} ₽`;
        return (
          `▶️ <b>Бой начался</b>\n` +
          `${this.label(actor)} vs ${this.label(p2)}\n` +
          `${kind}\n` +
          (m.matchId ? `ID: <code>${m.matchId}</code>` : '')
        );
      }

      case 'MATCH_FINISHED': {
        const winner = await getUser(m.winnerId as string | undefined);
        const wager = Number(m.wagerAmount ?? 0);
        const surrendered = m.surrenderedBy
          ? `\nСдался: ${this.label(await getUser(m.surrenderedBy as string))}`
          : '';
        const kind = m.isTraining ? '🎯 тренировка' : `💰 ${wager.toFixed(0)} ₽`;
        return (
          `🏁 <b>Бой завершён</b>\n` +
          `Победитель: ${this.label(winner)}\n` +
          `${kind}${surrendered}\n` +
          (m.matchId ? `ID: <code>${m.matchId}</code>` : '')
        );
      }

      case 'MATCH_CANCELLED': {
        const reason = String(m.reason ?? 'unknown');
        return (
          `🚫 <b>Матч отменён</b>\n` +
          `Игрок: ${who}\n` +
          `Причина: ${this.esc(reason)}\n` +
          (m.matchId ? `ID: <code>${m.matchId}</code>` : '')
        );
      }

      case 'ADMIN_CREDIT':
      case 'ADMIN_DEBIT': {
        const amt = Number(m.amount ?? 0);
        const sign = action === 'ADMIN_CREDIT' ? '+' : '';
        return (
          `🛠 <b>Админ: ${action === 'ADMIN_CREDIT' ? 'начисление' : 'списание'}</b>\n` +
          `Игрок: ${who}\n` +
          `Сумма: <b>${sign}${amt.toFixed(0)} ₽</b>\n` +
          (m.reason ? `Причина: ${this.esc(String(m.reason))}` : '')
        );
      }

      case 'ADMIN_BAN':
        return `⛔ <b>Бан</b>\nИгрок: ${who}`;

      case 'ADMIN_UNBAN':
        return `✅ <b>Разбан</b>\nИгрок: ${who}`;

      default:
        return `📌 <b>${this.esc(action)}</b>\nИгрок: ${who}`;
    }
  }

  private label(u: UserRow | null, metaUsername?: string): string {
    if (!u) return metaUsername ? `@${this.esc(metaUsername)}` : '—';
    if (u.telegramId?.startsWith('bot:')) {
      const nick = u.nickname || u.firstName || u.username || 'Бот';
      return `🤖 ${this.esc(nick)}`;
    }
    if (u.username) return `@${this.esc(u.username)}`;
    if (metaUsername) return `@${this.esc(metaUsername)}`;
    if (u.nickname) return this.esc(u.nickname);
    if (u.firstName) return this.esc(u.firstName);
    return `<code>${u.id.slice(0, 8)}</code>`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
