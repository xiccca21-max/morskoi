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

function genLobbyCode(len = 6): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function buildBotProfile(index: number): BotProfile {
  const female = index % 3 === 0;
  const first = female ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
  const portraitN = index % 100;
  const avatar = `https://randomuser.me/api/portraits/${female ? 'women' : 'men'}/${portraitN}.jpg`;

  // Имя/ник в стиле живых игроков: иногда тег, иногда имя с цифрами.
  const style = index % 3;
  let nickname: string;
  if (style === 0) nickname = `${pick(TAGS)}${rnd(1, 99)}`;
  else if (style === 1) nickname = `${first}_${rnd(10, 99)}`;
  else nickname = `${first} ${pick(['⚓', '🔱', '🎯', '🏴‍☠️', ''])}`.trim();
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

  private readonly enabled = (process.env.BOTS_ENABLED ?? 'true') !== 'false';
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

  /** Быстрый тестовый бой против бота (для разработки/проверки). */
  async startBotTest(userId: string): Promise<{ matchId: string }> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Тест с ботом временно недоступен');
    }
    const active = await this.game.findActiveMatchForUser(userId);
    if (active) throw new BadRequestException('У вас уже есть активный бой');

    try {
      await assertCanPlay(this.prisma, userId);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Нельзя играть');
    }

    const bot = await this.pickBot(0);
    if (!bot) throw new ServiceUnavailableException('Тестовый бот недоступен');

    return this.redis.withLock(`bot-test:${userId}`, 5000, async () => {
      const stillActive = await this.game.findActiveMatchForUser(userId);
      if (stillActive) throw new BadRequestException('У вас уже есть активный бой');

      const match = await this.game.createTrainingMatch(userId, bot.id);
      this.matchSkill.set(match.id, 'weak');
      await this.prepareBotMatch(match.id);
      await this.matchEvents.notifyMatchFound(match.id);
      this.logger.log(`Bot test match ${match.id}: ${userId} vs bot ${bot.id}`);
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
      select: { id: true },
      orderBy: { telegramId: 'asc' },
    });

    const keep = all.slice(0, this.targetCount);
    const surplus = all.slice(this.targetCount);
    keep.forEach((u) => this.botIds.add(u.id));

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

    for (let i = all.length; i < this.targetCount; i++) {
      const p = buildBotProfile(i);
      try {
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
      } catch (e: any) {
        this.logger.warn(`create bot ${p.telegramId} failed: ${e?.message}`);
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
    if (!this.enabled) return;
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

  /** Каждые 10 секунд держим открытыми ~BOT_OPEN_LOBBIES публичных вызовов от ботов. */
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
      select: { hostId: true },
    });
    const need = this.openLobbies - openBot.length;
    if (need <= 0) return;

    const busy = new Set(openBot.map((l) => l.hostId));
    const min = Number(process.env.MIN_WAGER ?? 100);
    const max = Number(process.env.MAX_WAGER ?? 10000);
    const wagerSet = [100, 200, 300, 500, 1000, 2000, 3000, 5000].filter((w) => w >= min && w <= max);

    const poolBots = await this.prisma.user.findMany({
      where: { telegramId: { startsWith: 'bot:' }, banned: false },
      select: { id: true, balance: true },
    });
    const avail = poolBots.filter((b) => !busy.has(b.id));

    for (let i = 0; i < need && avail.length; i++) {
      const bot = avail.splice(Math.floor(Math.random() * avail.length), 1)[0];
      const affordable = (wagerSet.length ? wagerSet : [min]).filter((w) => Number(bot.balance) >= w);
      if (!affordable.length) continue;
      try {
        await this.createBotLobby(bot.id, pick(affordable));
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
