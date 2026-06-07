import { BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameService } from '../game/game.service';
import { MatchEventsService } from '../common/match-events.service';
import { assertCanPlay } from '../common/responsible-gaming';

export type BotSkillLevel = 'strong' | 'weak';

const MALE_NAMES = [
  'Александр', 'Дмитрий', 'Максим', 'Иван', 'Артём', 'Никита', 'Егор', 'Сергей',
  'Андрей', 'Кирилл', 'Роман', 'Павел', 'Денис', 'Владимир', 'Алексей', 'Михаил',
  'Тимур', 'Глеб', 'Степан', 'Лев', 'Григорий', 'Борис', 'Виктор', 'Олег',
];
const FEMALE_NAMES = [
  'Анна', 'Мария', 'Екатерина', 'Дарья', 'Полина', 'Виктория', 'София', 'Алиса',
  'Ксения', 'Юлия', 'Ольга', 'Вероника', 'Арина', 'Милана', 'Кристина', 'Елена',
];
const TAGS = [
  'Shark', 'Kraken', 'Admiral', 'Torpedo', 'Naval', 'Storm', 'Pirate', 'Ghost',
  'Reaper', 'Viper', 'Wolf', 'Thunder', 'Frost', 'Blaze', 'Captain', 'Corsair',
  'Marlin', 'Triton', 'Anchor', 'Tide',
];

interface BotProfile {
  telegramId: string;
  username: string;
  firstName: string;
  nickname: string;
  avatar: string;
  balance: number;
  wins: number;
  losses: number;
  draws: number;
  totalWagered: number;
  totalWon: number;
  createdAt: Date;
}

const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/**
 * Курируемый пул из 80 «живых» соперников с заданными никами.
 * Аватарки максимально разные (загруженные фото в public/bots), а у кого «не хватило»
 * картинки — avatar='', и фронт рисует кружок с первой буквой имени на красном фоне.
 * Индекс 0 (bot:1) занят «Рокки», поэтому это пул для bot:2 … bot:81.
 */
interface BotIdentity {
  nickname: string;
  firstName: string;
  /** Полный https-URL аватара, либо '' — тогда у бота кружок с первой буквой. */
  avatar: string;
}
/**
 * Аватар-картинка, отдаётся НАШИМ origin из frontend/public/bots
 * (стабильно грузится в Telegram WebView, в отличие от внешних сервисов).
 */
const botImg = (file: string) => selfAsset(`bots/${file}`);

// 80 «живых» соперников. В public/bots лежат 62 аватарки (bot01…bot62.png):
// первые 62 ника получают картинку, остальным «не хватило» — avatar='' и фронт
// рисует первую букву имени на нашем красном фоне.
const BOT_NICKS: string[] = [
  // первая партия (30)
  'Aydar', 'Panda Crew', 'Skyroom', 'mk91', 'Dolmatix', 'n17club', 'whoptnova', 'Макс',
  'Am1r', 'Skynex', 'Panda Unit', 'd14room', 'Клим', 'mkr77', 'Dolman', '@whoptbase',
  'Sky Support', 'Роман', 'n9room', 'Makarov', 'Panda Labs', 'skyness77', 'whoptzone',
  'Арсен', 'mk14', 'Dolmat', 'Sky Panda', 'n22room', 'Тимур', 'Whopt Corp',
  // вторая партия (50)
  'Ve111or', 'Krymson', 'Nordex', 'blackunit', 'Тимон', 'Axelon', 'Redline', '@coldbase',
  'Varnix', 'Глеб', 'NeonFox1111', '@quietnode', 'Kravell232', 'Zentro', 'Леван65',
  'darkorbit', 'Mirrox97', 'ByteWolf', 'Ronex', '@ghostsector', 'Феликс', 'Alviro',
  'Traceon', 'nullcrew', 'Kairox0', 'Вадимыч', 'IronDesk', 'Nexora', 'softgate', 'Lorian',
  'Bramix', 'zeroport', 'Артём', 'Crypton', '1156', 'grayline', 'Sektor', 'Dorian',
  'nightdesk', 'Кирилл', 'Ravion', 'Lunex', 'corehub', 'Maksen', 'Frostel12', 'voidteam',
  'Oskarix', 'Даня', 'Terrox', 'silentcorp',
];

const BOT_AVATAR_COUNT = 62;
const BOT_IDENTITIES: BotIdentity[] = BOT_NICKS.map((nick, i) => ({
  nickname: nick,
  firstName: nick,
  avatar: i < BOT_AVATAR_COUNT ? botImg(`bot${String(i + 1).padStart(2, '0')}.png`) : '',
}));

/**
 * Выделенный тренировочный бот. Живёт в отдельном неймспейсе `trainbot:`,
 * поэтому НЕ попадает ни в матчмейкинг/публичные лобби (там фильтр `bot:`),
 * ни в публичный рейтинг (исключается в LeaderboardService). Используется
 * только для бесплатной тренировки «С ботом».
 */
const TRAINING_BOT_TID = 'trainbot:1';

function buildTrainingBotProfile(): BotProfile {
  return {
    telegramId: TRAINING_BOT_TID,
    username: 'naval_trainer',
    firstName: 'Боцман',
    nickname: 'Боцман-тренажёр 🤖',
    avatar: 'https://api.dicebear.com/7.x/bottts/png?seed=NavalTrainer&backgroundColor=1f2937',
    balance: 1_000_000,
    wins: 0,
    losses: 0,
    draws: 0,
    totalWagered: 0,
    totalWon: 0,
    createdAt: new Date(),
  };
}

function genLobbyCode(len = 6): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** Полный URL аватара, отдаваемого нашим origin (из TELEGRAM_WEBAPP_URL). */
function selfAsset(file: string): string {
  const base = (process.env.TELEGRAM_WEBAPP_URL || 'https://navalclash.xyz').replace(/\/$/, '');
  return `${base}/${file.replace(/^\//, '')}`;
}

function buildBotProfile(index: number): BotProfile {
  // Первый бот — фиксированный «Рокки» с фото Рокки Бальбо. Статистика фиксированная,
  // чтобы он не висел в топе журнала/рейтинга (48 побед).
  if (index === 0) {
    const wins = 48;
    const losses = 27;
    return {
      telegramId: `bot:${index + 1}`,
      username: 'Рокки',
      firstName: 'Рокки',
      nickname: 'Рокки 🥊',
      avatar: selfAsset('rocky.jpg'),
      balance: 60000,
      wins,
      losses,
      draws: 1,
      totalWagered: (wins + losses) * 400,
      totalWon: wins * 600,
      createdAt: new Date(Date.now() - 45 * 86_400_000),
    };
  }

  // Для bot:2 … bot:31 берём уникальную личность из курируемого пула.
  // Если ботов запрошено больше пула — добираем процедурно (имена/теги вразнобой).
  const fromPool = index - 1 < BOT_IDENTITIES.length ? BOT_IDENTITIES[index - 1] : null;
  let first: string;
  let nickname: string;
  let avatar: string;
  if (fromPool) {
    // Показываем ИМЕННО заданный ник (лобби/рейтинг используют firstName),
    // чтобы соперник назывался так же, как в списке боёв.
    first = fromPool.nickname;
    nickname = fromPool.nickname;
    avatar = fromPool.avatar; // '' = без аватара (фронт нарисует кружок с буквой)
  } else {
    const female = index % 3 === 0;
    first = female ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
    const portraitN = index % 100;
    avatar = `https://api.dicebear.com/7.x/personas/png?seed=navalbot${index}_${portraitN}&backgroundColor=1a1a2e`;
    const style = index % 3;
    if (style === 0) nickname = `${pick(TAGS)}${rnd(1, 99)}`;
    else if (style === 1) nickname = `${first}_${rnd(10, 99)}`;
    else nickname = `${first} ${pick(['⚓', '🔱', '🎯', '🏴‍☠️', ''])}`.trim();
  }
  const username = `${pick(TAGS).toLowerCase()}_${rnd(100, 999)}`;

  // Профиль «нетто-победителя»: винрейт 53–75%.
  const wins = rnd(12, 240);
  const wr = 0.53 + Math.random() * 0.22;
  const losses = Math.max(1, Math.round((wins * (1 - wr)) / wr));
  const draws = rnd(0, 2);
  const avgNet = rnd(180, 950);
  const totalWon = wins * avgNet;
  const totalWagered = (wins + losses) * rnd(120, 700);
  const balance = rnd(6000, 140000);
  const createdAt = new Date(Date.now() - rnd(3, 70) * 86_400_000);

  return {
    telegramId: `bot:${index + 1}`,
    username,
    firstName: first,
    nickname,
    avatar,
    balance,
    wins,
    losses,
    draws,
    totalWagered,
    totalWon,
    createdAt,
  };
}

/**
 * BotsService — «живые» соперники, пока мало реальных игроков.
 * 1) сидит пул ~50 ботов с аватарами/статистикой для лидерборда;
 * 2) добирает ожидающих в очереди игроков в матч против бота;
 * 3) задаёт уровень игры бота (винрейт настраивается BOT_WIN_RATE).
 * Сами ходы бота исполняет GameGateway (там сокет-события).
 */
@Injectable()
export class BotsService implements OnModuleInit {
  private readonly logger = new Logger('Bots');
  private readonly botIds = new Set<string>();
  private readonly matchSkill = new Map<string, BotSkillLevel>();
  private trainingBotId: string | null = null;
  /**
   * Онлайн-сессии ботов: имитируем живых людей — кто-то «сидит» в лобби,
   * кто-то ушёл на перерыв. Хранится в памяти (сбрасывается при рестарте).
   */
  private readonly botSessions = new Map<string, { online: boolean; nextToggle: number }>();

  private readonly enabled = (process.env.BOTS_ENABLED ?? 'true') !== 'false';
  /** Автоподбор бота в очередь на реальные ставки (по умолчанию выкл — только PvP). */
  private readonly paidMmEnabled = process.env.BOT_PAID_MM === 'true';
  private readonly targetCount = Number(process.env.BOTS_COUNT ?? 1);
  private readonly winRate = Number(process.env.BOT_WIN_RATE ?? 0.62);
  private readonly waitSec = Number(process.env.BOT_MATCH_WAIT_SEC ?? 10);
  private readonly openLobbies = Number(process.env.BOT_OPEN_LOBBIES ?? 1);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly game: GameService,
    private readonly matchEvents: MatchEventsService,
  ) {}

  async onModuleInit() {
    // Тренировочный бот доступен всегда (даже при BOTS_ENABLED=false) —
    // это осознанный выбор игрока, а не авто-добор очереди.
    try {
      await this.ensureTrainingBot();
    } catch (e: any) {
      this.logger.warn(`ensureTrainingBot failed: ${e?.message}`);
    }

    if (!this.enabled) {
      this.logger.log('Bots disabled (BOTS_ENABLED=false)');
      return;
    }
    try {
      await this.ensureBots();
      await this.lobbyFillTick();
    } catch (e: any) {
      this.logger.warn(`ensureBots failed: ${e?.message}`);
    }
  }

  /**
   * Идемпотентно создаёт/обновляет выделенного тренировочного бота и
   * регистрирует его id в botIds (чтобы GameGateway исполнял его ходы).
   */
  async ensureTrainingBot() {
    const p = buildTrainingBotProfile();
    let bot = await this.prisma.user.findUnique({ where: { telegramId: p.telegramId } });
    if (!bot) {
      bot = await this.prisma.user.create({
        data: {
          telegramId: p.telegramId,
          username: p.username,
          firstName: p.firstName,
          nickname: p.nickname,
          avatar: p.avatar,
          balance: p.balance,
          withdrawable: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          totalWagered: 0,
          totalWon: 0,
          agreedToTermsAt: new Date(),
        } as any,
      });
    } else {
      bot = await this.prisma.user.update({
        where: { id: bot.id },
        data: {
          username: p.username,
          firstName: p.firstName,
          nickname: p.nickname,
          avatar: p.avatar,
          banned: false,
          balance: p.balance,
        } as any,
      });
    }
    this.trainingBotId = bot.id;
    this.botIds.add(bot.id);
    this.logger.log(`Training bot ready: ${bot.id}`);
  }

  isBot(userId: string | null | undefined): boolean {
    return !!userId && this.botIds.has(userId);
  }

  skillForMatch(matchId: string): BotSkillLevel {
    return this.matchSkill.get(matchId) ?? 'strong';
  }

  forgetMatch(matchId: string) {
    this.matchSkill.delete(matchId);
  }

  /**
   * Готовит матч с участием бота: фиксирует уровень игры и авто-расставляет
   * флот бота, если он ещё не расставлен. Возвращает true, если бот в матче.
   * Используется и для matchmaking, и для публичных лобби.
   */
  async prepareBotMatch(matchId: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { gameState: true },
    });
    if (!match || !match.gameState) return false;
    const botId = this.isBot(match.player1Id)
      ? match.player1Id
      : this.isBot(match.player2Id)
        ? match.player2Id
        : null;
    if (!botId) return false;

    if (!this.matchSkill.has(matchId)) {
      this.matchSkill.set(matchId, Math.random() < this.winRate ? 'strong' : 'weak');
    }

    const isP1 = match.player1Id === botId;
    const boardJson = (isP1 ? match.gameState.player1Board : match.gameState.player2Board) as unknown as string;
    let placed = false;
    try { placed = JSON.parse(boardJson)?.placed === true; } catch { /* пусто */ }
    if (!placed) {
      try {
        await this.game.submitPlacement(matchId, botId, 'auto');
      } catch (e: any) {
        this.logger.warn(`bot placement ${matchId}: ${e?.message}`);
      }
    }
    return true;
  }

  /** Бесплатная тренировка против выделенного тренировочного бота. */
  async startBotTest(userId: string): Promise<{ matchId: string }> {
    const active = await this.game.findActiveMatchForUser(userId);
    if (active) throw new BadRequestException('У вас уже есть активный бой');

    try {
      await assertCanPlay(this.prisma, userId);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Нельзя играть');
    }

    // Гарантируем наличие тренировочного бота (на случай если init не успел).
    if (!this.trainingBotId) {
      await this.ensureTrainingBot();
    }
    const botId = this.trainingBotId;
    if (!botId) throw new ServiceUnavailableException('Тренировочный бот недоступен');

    return this.redis.withLock(`bot-test:${userId}`, 5000, async () => {
      const stillActive = await this.game.findActiveMatchForUser(userId);
      if (stillActive) throw new BadRequestException('У вас уже есть активный бой');

      const match = await this.game.createTrainingMatch(userId, botId);
      this.matchSkill.set(match.id, 'weak');
      await this.prepareBotMatch(match.id);
      await this.matchEvents.notifyMatchFound(match.id);
      this.logger.log(`Training-bot match ${match.id}: ${userId} vs trainbot ${botId}`);
      return { matchId: match.id };
    });
  }

  /**
   * Идемпотентно поддерживает ровно targetCount активных ботов.
   * Лишних (если раньше создавалось больше) — баним и закрываем их лобби,
   * чтобы они исчезли из матчмейкинга/лобби, но без удаления из БД (FK).
   */
  async ensureBots() {
    const all = await this.prisma.user.findMany({
      where: { telegramId: { startsWith: 'bot:' } },
      select: { id: true, telegramId: true },
    });
    const byTid = new Map(all.map((u) => [u.telegramId, u]));
    const botNum = (tid: string) => {
      const m = /^bot:(\d+)$/.exec(tid);
      return m ? Number(m[1]) : NaN;
    };

    // Лишние боты (номер > targetCount) — баним и закрываем их лобби, чтобы они
    // исчезли из матчмейкинга/лобби, но без удаления из БД (внешние ключи).
    const surplus = all.filter((u) => {
      const n = botNum(u.telegramId);
      return Number.isFinite(n) && n > this.targetCount;
    });
    if (surplus.length) {
      const ids = surplus.map((u) => u.id);
      await this.prisma.lobby.updateMany({
        where: { hostId: { in: ids }, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      await this.prisma.user.updateMany({
        where: { id: { in: ids }, banned: false },
        data: { banned: true } as any,
      });
      ids.forEach((id) => this.botIds.delete(id));
      this.logger.log(`Neutralized ${surplus.length} surplus bot(s)`);
    }

    // Создаём недостающих и обновляем личность существующих (bot:1 … bot:targetCount).
    // Так новые ники/аватарки применяются прямо на деплое, без правок в БД.
    for (let i = 0; i < this.targetCount; i++) {
      const p = buildBotProfile(i);
      const existing = byTid.get(p.telegramId);
      try {
        if (!existing) {
          const u = await this.prisma.user.create({
            data: {
              telegramId: p.telegramId,
              username: p.username,
              firstName: p.firstName,
              nickname: p.nickname,
              avatar: p.avatar,
              balance: p.balance,
              withdrawable: 0,
              wins: p.wins,
              losses: p.losses,
              draws: p.draws,
              totalWagered: p.totalWagered,
              totalWon: p.totalWon,
              agreedToTermsAt: new Date(),
              createdAt: p.createdAt,
            } as any,
          });
          this.botIds.add(u.id);
        } else {
          // Обновляем только личность (ник/имя/аватар) и снимаем бан, если был.
          // username не трогаем (уникальное поле), статистику живых ботов сохраняем.
          // Исключение — «Рокки» (i=0): у него статистика зафиксирована.
          const data: any = {
            firstName: p.firstName,
            nickname: p.nickname,
            avatar: p.avatar,
            banned: false,
          };
          if (i === 0) {
            data.wins = p.wins;
            data.losses = p.losses;
            data.draws = p.draws;
            data.totalWon = p.totalWon;
            data.totalWagered = p.totalWagered;
          }
          await this.prisma.user.update({ where: { id: existing.id }, data });
          this.botIds.add(existing.id);
        }
      } catch (e: any) {
        this.logger.warn(`ensure bot ${p.telegramId} failed: ${e?.message}`);
      }
    }
    this.logger.log(`Bots ready: ${this.botIds.size}/${this.targetCount}`);
  }

  /** Подбирает бота, способного покрыть ставку. При нехватке — пополняет баланс боту. */
  private async pickBot(wager: number) {
    const candidates = await this.prisma.user.findMany({
      where: { telegramId: { startsWith: 'bot:' }, banned: false, balance: { gte: wager } },
      select: { id: true },
      take: 60,
    });
    if (candidates.length) return pick(candidates);

    const any = await this.prisma.user.findFirst({ where: { telegramId: { startsWith: 'bot:' } } });
    if (any) {
      await this.prisma.user.update({ where: { id: any.id }, data: { balance: { increment: wager * 25 } } });
      return { id: any.id };
    }
    return null;
  }

  /** Каждые 5 секунд: добираем «зависших» в очереди игроков матчем против бота. */
  @Cron('*/5 * * * * *')
  async botFillTick() {
    if (!this.enabled || !this.paidMmEnabled) return;
    const cutoff = new Date(Date.now() - this.waitSec * 1000);
    const entries = await this.prisma.matchmakingQueue.findMany({
      where: { createdAt: { lte: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const e of entries) {
      if (this.isBot(e.userId)) continue;
      try {
        await this.fillOne(e.userId, Number(e.wagerAmount));
      } catch (err: any) {
        this.logger.warn(`botFill ${e.userId} failed: ${err?.message}`);
      }
    }
  }

  private async fillOne(userId: string, wager: number) {
    const active = await this.game.findActiveMatchForUser(userId);
    if (active) {
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });
      return;
    }
    const human = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!human) {
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });
      return;
    }
    if (Number(human.balance) < wager) {
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });
      return;
    }
    try {
      await assertCanPlay(this.prisma, userId);
    } catch {
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });
      return;
    }

    const bot = await this.pickBot(wager);
    if (!bot) return;

    await this.redis.withLock(`mm:botfill:${userId}`, 5000, async () => {
      const still = await this.prisma.matchmakingQueue.findUnique({ where: { userId } });
      if (!still) return;
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });

      // человек — player1 (ходит первым), бот — player2
      const match = await this.game.createMatch(userId, bot.id, wager);
      await this.prepareBotMatch(match.id);
      await this.matchEvents.notifyMatchFound(match.id);
      this.logger.log(`Bot match ${match.id}: ${userId} vs bot ${bot.id} @ ${wager}₽ (${this.matchSkill.get(match.id)})`);
    });
  }

  // ============= Публичные лобби с ботами =============

  /**
   * Онлайн ли бот прямо сейчас. Имитация живого игрока: сессия в лобби 20–90 мин,
   * затем перерыв 30–60 мин. Первичная инициализация со случайным сдвигом, чтобы
   * боты не «появлялись» и не «уходили» все одновременно.
   */
  private isBotOnline(botId: string): boolean {
    const now = Date.now();
    let s = this.botSessions.get(botId);
    // Доля онлайна ~0.36 от пула (≈80 ботов) даёт «в сети» обычно 20–40 человек,
    // число всё время плавает, а конкретные боты постоянно меняются (ротация).
    if (!s) {
      const startOnline = Math.random() < 0.62;
      const dur = startOnline ? rnd(40, 120) : rnd(30, 70);
      const elapsed = Math.floor(Math.random() * dur); // уже «внутри» периода
      s = { online: startOnline, nextToggle: now + (dur - elapsed) * 60_000 };
      this.botSessions.set(botId, s);
      return s.online;
    }
    if (now >= s.nextToggle) {
      s.online = !s.online;
      const dur = s.online ? rnd(40, 120) : rnd(30, 70);
      s.nextToggle = now + dur * 60_000;
    }
    return s.online;
  }

  /** Дневной ритм: ночью в лобби меньше «людей», днём/вечером — больше. МSK ≈ UTC+3. */
  private onlineFactor(now: Date): number {
    const h = (now.getUTCHours() + 3) % 24;
    if (h >= 2 && h < 8) return 0.25;   // глубокая ночь
    if (h >= 8 && h < 12) return 0.6;   // утро
    if (h >= 12 && h < 24) return 1;    // день и вечер — пик
    return 0.5;                          // 00:00–02:00
  }

  /** «Абсолютно разные» ставки: чаще круглые пресеты, иногда произвольная сумма. */
  private randomBotWager(balance: number): number {
    const min = Number(process.env.MIN_WAGER ?? 100);
    const presets = [100, 150, 200, 250, 300, 400, 500, 700, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
    const affordable = presets.filter((w) => w >= min && w <= balance);
    if (affordable.length && Math.random() < 0.7) return pick(affordable);
    const hi = Math.min(balance, 5000);
    if (hi <= min) return affordable.length ? pick(affordable) : min;
    const raw = min + Math.floor(Math.random() * (hi - min));
    return Math.max(min, Math.round(raw / 50) * 50); // кратно 50 — выглядит «по-человечески»
  }

  /** Каждые 10 секунд поддерживаем живой список лобби: онлайн-боты заходят, ушедшие — пропадают. */
  @Cron('*/10 * * * * *')
  async lobbyFillTick() {
    if (!this.enabled || this.openLobbies <= 0) return;
    const now = new Date();

    // Закрываем протухшие лобби ботов, чтобы не копились.
    await this.prisma.lobby.updateMany({
      where: { status: 'OPEN', expiresAt: { lte: now }, host: { telegramId: { startsWith: 'bot:' } } } as any,
      data: { status: 'CLOSED' },
    });

    const openBot = await this.prisma.lobby.findMany({
      where: { isPublic: true, status: 'OPEN', expiresAt: { gt: now }, host: { telegramId: { startsWith: 'bot:' } } } as any,
      select: { id: true, hostId: true },
    });

    // «Ушедшие на перерыв» боты убирают своё открытое лобби (как будто вышли из игры).
    const wentOffline = openBot.filter((l) => !this.isBotOnline(l.hostId));
    if (wentOffline.length) {
      await this.prisma.lobby.updateMany({
        where: { id: { in: wentOffline.map((l) => l.id) } },
        data: { status: 'CLOSED' },
      });
    }
    const stillOpen = openBot.filter((l) => this.isBotOnline(l.hostId));

    // Держим список «живым»: всегда минимум 30 открытых боёв, до openLobbies сверху.
    // Дневной ритм лишь слегка играет числом в этом коридоре (не опускаемся ниже 30).
    const floor = Math.min(30, this.openLobbies);
    const target = Math.max(
      floor,
      Math.min(this.openLobbies, Math.round(this.openLobbies * this.onlineFactor(now)) + rnd(-2, 2)),
    );
    const need = target - stillOpen.length;
    if (need <= 0) return;

    const busy = new Set(stillOpen.map((l) => l.hostId));
    const poolBots = await this.prisma.user.findMany({
      where: { telegramId: { startsWith: 'bot:' }, banned: false },
      select: { id: true, balance: true },
    });
    // Только онлайн и не занятые лобби боты могут «зайти».
    const avail = poolBots.filter((b) => !busy.has(b.id) && this.isBotOnline(b.id));

    for (let i = 0; i < need && avail.length; i++) {
      const bot = avail.splice(Math.floor(Math.random() * avail.length), 1)[0];
      const wager = this.randomBotWager(Number(bot.balance));
      if (Number(bot.balance) < wager) continue;
      try {
        await this.createBotLobby(bot.id, wager);
      } catch (e: any) {
        this.logger.warn(`createBotLobby failed: ${e?.message}`);
      }
    }
  }

  private async createBotLobby(botId: string, wager: number) {
    await this.prisma.lobby.updateMany({
      where: { hostId: botId, status: 'OPEN' },
      data: { status: 'CLOSED' },
    });
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = genLobbyCode(6);
      const exists = await this.prisma.lobby.findUnique({ where: { code } });
      if (!exists) break;
    }
    const expiresAt = new Date(Date.now() + rnd(20, 45) * 60 * 1000);
    await this.prisma.lobby.create({
      data: { code, hostId: botId, wagerAmount: wager, expiresAt, status: 'OPEN', isPublic: true } as any,
    });
  }
}
