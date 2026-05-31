import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameService } from '../game/game.service';
import { MatchEventsService } from '../common/match-events.service';

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
  private readonly targetCount = Number(process.env.BOTS_COUNT ?? 50);
  private readonly winRate = Number(process.env.BOT_WIN_RATE ?? 0.62);
  private readonly waitSec = Number(process.env.BOT_MATCH_WAIT_SEC ?? 10);

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

  /** Идемпотентно создаёт недостающих ботов до targetCount. */
  async ensureBots() {
    const existing = await this.prisma.user.findMany({
      where: { telegramId: { startsWith: 'bot:' } },
      select: { id: true },
    });
    existing.forEach((u) => this.botIds.add(u.id));

    for (let i = existing.length; i < this.targetCount; i++) {
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
    if (Number(human.balance) < wager) return; // не по карману — ждём/выйдет сам

    const bot = await this.pickBot(wager);
    if (!bot) return;

    await this.redis.withLock(`mm:botfill:${userId}`, 5000, async () => {
      const still = await this.prisma.matchmakingQueue.findUnique({ where: { userId } });
      if (!still) return;
      await this.prisma.matchmakingQueue.deleteMany({ where: { userId } });

      // человек — player1 (ходит первым), бот — player2
      const match = await this.game.createMatch(userId, bot.id, wager);
      await this.game.submitPlacement(match.id, bot.id, 'auto');
      this.matchSkill.set(match.id, Math.random() < this.winRate ? 'strong' : 'weak');
      await this.matchEvents.notifyMatchFound(match.id);
      this.logger.log(`Bot match ${match.id}: ${userId} vs bot ${bot.id} @ ${wager}₽ (${this.matchSkill.get(match.id)})`);
    });
  }
}
