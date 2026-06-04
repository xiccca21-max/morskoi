import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { GameService } from './game.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { LobbyService } from '../matchmaking/lobby.service';
import { RedisService } from '../redis/redis.service';
import { ShipPlacement, AttackCell } from './engine/types';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { MatchEventsService } from '../common/match-events.service';
import { BotsService } from '../bots/bots.service';
import { PresenceService } from '../common/presence.service';
import { chooseBotMove, BOT_SKILL_STRONG, BOT_SKILL_WEAK } from '../bots/bot-engine';
import { normalizeWager } from '../common/wager';

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    tgId: string;
    username?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',')
      : true,
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger('GameGateway');

  @WebSocketServer()
  server!: Server;

  // Карта userId → socketId (последний активный)
  private userSockets = new Map<string, string>();
  // Таймауты ходов: matchId → NodeJS.Timeout
  private turnTimers = new Map<string, NodeJS.Timeout>();
  // Счётчик пропущенных ходов (AFK/дисконнект): matchId → { userId, count, total }
  //  count — подряд одним игроком (форфейт), total — всего по матчу (анти-зависание).
  private afkCounters = new Map<string, { userId: string; count: number; total: number }>();
  // Таймауты фазы расстановки: matchId → NodeJS.Timeout
  private placementTimers = new Map<string, NodeJS.Timeout>();
  // Rate limit: userId:event → { count, resetAt }
  private socketRates = new Map<string, { count: number; resetAt: number }>();
  // Матчи, где бот сейчас «думает» над ходом (защита от двойного запуска)
  private botThinking = new Set<string>();

  constructor(
    private readonly auth: AuthService,
    private readonly game: GameService,
    private readonly mm: MatchmakingService,
    private readonly lobbies: LobbyService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly botService: TelegramBotService,
    private readonly matchEvents: MatchEventsService,
    private readonly bots: BotsService,
    private readonly presence: PresenceService,
  ) {}

  onModuleInit() {
    this.matchEvents.setHandler((id) => this.notifyMatchFound(id));
    this.logger.log('Game gateway initialised');
  }

  private checkSocketRate(userId: string, event: string, limit = 40, windowMs = 10_000): boolean {
    const key = `${userId}:${event}`;
    const now = Date.now();
    const entry = this.socketRates.get(key);
    if (!entry || now > entry.resetAt) {
      this.socketRates.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  }

  // ============= Подключение =============

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.toString().replace('Bearer ', ''));
      if (!token) throw new Error('No token');
      const payload = await this.auth.verifyActiveToken(token);
      (client as AuthedSocket).data = {
        userId: payload.sub,
        tgId: payload.tgId,
        username: payload.username,
      };
      this.userSockets.set(payload.sub, client.id);
      client.join(`user:${payload.sub}`);
      void this.presence.touch(payload.sub, {
        username: payload.username,
        source: 'ws',
      });
      this.logger.log(`Connect ${payload.sub} (${client.id})`);

      // если есть активный матч — переподключаем игрока в комнату
      const active = await this.game.findActiveMatchForUser(payload.sub);
      if (active) {
        client.join(`match:${active.id}`);
        const state = await this.game.getStateForUser(active.id, payload.sub);
        client.emit('match:state', state);
      }
    } catch (e: any) {
      this.logger.warn(`Connection rejected: ${e?.message}`);
      client.emit('auth:error', { message: e?.message ?? 'auth failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as AuthedSocket).data?.userId;
    if (!userId) return;
    if (this.userSockets.get(userId) === client.id) {
      this.userSockets.delete(userId);
      void this.presence.clear(userId);
    }
    // Не отменяем матч сразу: даём время на reconnect (Socket.IO heartbeat уже это покрывает).
    this.logger.log(`Disconnect ${userId}`);
  }

  // ============= Утилиты =============

  private requireAuth(client: Socket): AuthedSocket {
    const s = client as AuthedSocket;
    if (!s.data?.userId) throw new Error('Unauthenticated');
    return s;
  }

  /** Лёгкая перепроверка бана/самоисключения на денежных действиях (бан мог прийти после connect). */
  private async assertNotBlocked(userId: string) {
    const u = (await this.prisma.user.findUnique({
      where: { id: userId },
    })) as { banned?: boolean; selfExcludedUntil?: Date | null } | null;
    if (!u) throw new Error('User not found');
    if (u.banned) throw new Error('Аккаунт заблокирован');
    const until = u.selfExcludedUntil ? new Date(u.selfExcludedUntil) : null;
    if (until && until.getTime() > Date.now()) throw new Error('Самоисключение активно');
  }

  private async ensureNonce(userId: string, nonce?: string) {
    if (!nonce) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing action nonce');
      }
      return;
    }
    const ok = await this.redis.consumeNonce(userId, nonce);
    if (!ok) throw new Error('Duplicate or replayed action');
  }

  private async broadcastStateToBothPlayers(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return;
    for (const uid of [match.player1Id, match.player2Id].filter(Boolean) as string[]) {
      const state = await this.game.getStateForUser(matchId, uid);
      this.server.to(`user:${uid}`).emit('match:state', state);
    }
  }

  private scheduleTurnTimeout(matchId: string, deadline: Date | null) {
    const existing = this.turnTimers.get(matchId);
    if (existing) clearTimeout(existing);
    if (!deadline) return;
    const ms = Math.max(0, deadline.getTime() - Date.now());
    const t = setTimeout(async () => {
      try {
        const r = await this.game.handleTurnTimeout(matchId);
        if (!r || !r.timedOut) return;
        const timedOut = r.timedOut;

        // Анти-AFK: если один и тот же игрок пропускает ходы подряд — засчитываем поражение.
        const maxMissed = Number(process.env.AFK_FORFEIT_TIMEOUTS ?? 2);
        const prev = this.afkCounters.get(matchId);
        const count = prev && prev.userId === timedOut ? prev.count + 1 : 1;
        const total = (prev?.total ?? 0) + 1;
        this.afkCounters.set(matchId, { userId: timedOut, count, total });

        // Анти-зависание: оба игрока пропускают ходы по очереди — счётчик подряд
        // сбрасывается и форфейт не наступает. Ограничиваем общее число пропусков
        // по матчу: после лимита отменяем бой и возвращаем ставки обоим.
        const maxTotal = Number(process.env.AFK_MATCH_MAX_TIMEOUTS ?? 6);
        if (total >= maxTotal) {
          this.afkCounters.delete(matchId);
          this.bots.forgetMatch(matchId);
          this.clearTurnTimer(matchId);
          await this.game.cancelMatch(matchId, 'afk_stall');
          this.server.to(`match:${matchId}`).emit('match:cancelled', { matchId, reason: 'afk_stall' });
          await this.broadcastStateToBothPlayers(matchId);
          return;
        }

        if (count >= maxMissed) {
          this.afkCounters.delete(matchId);
          this.bots.forgetMatch(matchId);
          const res = await this.game.surrender(matchId, timedOut);
          this.clearTurnTimer(matchId);
          this.server.to(`match:${matchId}`).emit('match:finished', {
            matchId,
            winnerId: res.winnerId,
            forfeitedBy: timedOut,
            reason: 'afk',
          });
          await this.broadcastStateToBothPlayers(matchId);
          return;
        }

        this.server.to(`match:${matchId}`).emit('match:turnTimeout', { ...r, missed: count });
        await this.broadcastStateToBothPlayers(matchId);

        // Перепланируем следующий тайм-аут (иначе при двойном AFK ходы не идут)
        const gs = await this.prisma.gameState.findUnique({ where: { matchId } });
        if (gs?.gameStatus === 'IN_PROGRESS') {
          this.scheduleTurnTimeout(matchId, gs.turnDeadline ?? null);
          // ход мог перейти к боту — пусть походит
          void this.driveBotIfNeeded(matchId);
        }
      } catch (e: any) {
        this.logger.warn(`turn timeout error: ${e?.message}`);
      }
    }, ms + 250);
    this.turnTimers.set(matchId, t);
  }

  private clearTurnTimer(matchId: string) {
    const t = this.turnTimers.get(matchId);
    if (t) clearTimeout(t);
    this.turnTimers.delete(matchId);
  }

  private schedulePlacementTimeout(matchId: string) {
    const existing = this.placementTimers.get(matchId);
    if (existing) clearTimeout(existing);
    const sec = Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60);
    const t = setTimeout(async () => {
      try {
        const r = await this.game.handlePlacementTimeout(matchId);
        this.placementTimers.delete(matchId);
        if (r?.players?.length) {
          this.server.to(`match:${matchId}`).emit('match:cancelled', {
            matchId,
            reason: 'placement_timeout',
          });
          for (const uid of r.players) {
            this.server.to(`user:${uid}`).emit('match:cancelled', { matchId, reason: 'placement_timeout' });
          }
        }
      } catch (e: any) {
        this.logger.warn(`placement timeout error: ${e?.message}`);
      }
    }, sec * 1000 + 1500);
    this.placementTimers.set(matchId, t);
  }

  private clearPlacementTimer(matchId: string) {
    const t = this.placementTimers.get(matchId);
    if (t) clearTimeout(t);
    this.placementTimers.delete(matchId);
  }

  // ============= Ходы бота =============

  /** Если сейчас ход бота — запланировать его выстрел с «человеческой» задержкой. */
  private async driveBotIfNeeded(matchId: string) {
    try {
      const gs = await this.prisma.gameState.findUnique({ where: { matchId } });
      if (!gs || gs.gameStatus !== 'IN_PROGRESS' || !gs.currentTurn) return;
      if (!this.bots.isBot(gs.currentTurn)) return;
      if (this.botThinking.has(matchId)) return;
      this.botThinking.add(matchId);

      const min = Number(process.env.BOT_MIN_DELAY_MS ?? 1000);
      const max = Number(process.env.BOT_MAX_DELAY_MS ?? 3000);
      const delay = min + Math.floor(Math.random() * Math.max(1, max - min));
      setTimeout(() => {
        this.performBotMove(matchId)
          .catch((e: any) => this.logger.warn(`bot move ${matchId}: ${e?.message}`))
          .finally(() => this.botThinking.delete(matchId));
      }, delay);
    } catch (e: any) {
      this.logger.warn(`driveBot ${matchId}: ${e?.message}`);
      this.botThinking.delete(matchId);
    }
  }

  private async performBotMove(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { gameState: true } });
    if (!match || !match.gameState || match.status !== 'IN_PROGRESS') return;
    const gs = match.gameState;
    const botId = gs.currentTurn;
    if (!botId || !this.bots.isBot(botId)) return;

    // Бот атакует доску соперника-человека.
    const botIsP1 = match.player1Id === botId;
    const humanBoardJson = (botIsP1 ? gs.player2Board : gs.player1Board) as unknown as string;
    let attacks: AttackCell[] = [];
    try { attacks = JSON.parse(humanBoardJson)?.attacksReceived ?? []; } catch { /* пустая история */ }

    const skill = this.bots.skillForMatch(matchId) === 'weak' ? BOT_SKILL_WEAK : BOT_SKILL_STRONG;
    const move = chooseBotMove(attacks, skill);

    const r = await this.game.attack(matchId, botId, move.x, move.y);

    this.server.to(`match:${matchId}`).emit('match:attack', {
      by: botId,
      x: move.x,
      y: move.y,
      hit: r.result.hit,
      sunk: r.result.sunk,
      sunkShip: r.result.sunkShip,
      nextTurn: r.nextTurn,
      gameStatus: r.gameStatus,
      winnerId: r.winnerId,
    });
    await this.broadcastStateToBothPlayers(matchId);

    if (r.gameStatus === 'IN_PROGRESS') {
      const ngs = await this.prisma.gameState.findUnique({ where: { matchId } });
      this.scheduleTurnTimeout(matchId, ngs?.turnDeadline ?? null);
      // попадание — ход остаётся у бота, продолжаем серию
      if (ngs?.currentTurn && this.bots.isBot(ngs.currentTurn)) {
        void this.driveBotIfNeeded(matchId);
      }
    } else if (r.gameStatus === 'FINISHED') {
      this.bots.forgetMatch(matchId);
      await this.emitMatchFinished(matchId, r.winnerId ?? null);
    }
  }

  /** Общая рассылка финала: событие + обновление балансов игроков. */
  private async emitMatchFinished(matchId: string, winnerId: string | null) {
    this.clearTurnTimer(matchId);
    this.afkCounters.delete(matchId);
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    this.server.to(`match:${matchId}`).emit('match:finished', {
      matchId,
      winnerId,
      prizePool: match ? Number(match.prizePool) : 0,
      rakeAmount: match ? Number(match.rakeAmount) : 0,
    });
    if (match) {
      for (const uid of [match.player1Id, match.player2Id].filter(Boolean) as string[]) {
        const u = await this.prisma.user.findUnique({ where: { id: uid }, select: { balance: true } });
        if (u) this.server.to(`user:${uid}`).emit('wallet:update', Number(u.balance));
      }
    }
  }

  // ============= Matchmaking =============

  @SubscribeMessage('mm:join')
  async mmJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { wagerAmount: number; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'mm:join', 20)) {
      return { ok: false, error: 'Слишком много запросов' };
    }
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const wagerAmount = normalizeWager(body.wagerAmount);
      const r = await this.mm.enqueue(s.data.userId, wagerAmount);
      if (r.matched && r.matchId) {
        return { ok: true, matched: true, matchId: r.matchId };
      }
      return { ok: true, matched: false };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'mm error' };
    }
  }

  @SubscribeMessage('mm:leave')
  async mmLeave(@ConnectedSocket() client: Socket) {
    const s = this.requireAuth(client);
    await this.mm.leave(s.data.userId);
    return { ok: true };
  }

  private async notifyMatchFound(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return;
    const placementSec = Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60);
    const placementDeadline = match.startedAt
      ? new Date(match.startedAt.getTime() + placementSec * 1000).toISOString()
      : null;
    const players = [match.player1Id, match.player2Id].filter(Boolean) as string[];
    // Подтягиваем краткие профили обоих игроков, чтобы показать VS-аватары в оверлее.
    const profiles = await this.prisma.user.findMany({
      where: { id: { in: players } },
      select: { id: true, username: true, firstName: true, avatar: true },
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const displayName = (p?: { username: string | null; firstName: string | null }) =>
      (p?.username || p?.firstName || 'Капитан') as string;
    for (const uid of players) {
      const sId = this.userSockets.get(uid);
      if (sId) {
        const sock = this.server.sockets.sockets.get(sId);
        sock?.join(`match:${matchId}`);
      }
      const oppId = uid === match.player1Id ? match.player2Id : match.player1Id;
      const me = profileById.get(uid);
      const opp = oppId ? profileById.get(oppId) : undefined;
      this.server.to(`user:${uid}`).emit('match:found', {
        matchId,
        wagerAmount: Number(match.wagerAmount),
        opponentId: oppId,
        opponentName: displayName(opp),
        opponentAvatar: opp?.avatar ?? null,
        meName: displayName(me),
        meAvatar: me?.avatar ?? null,
        placementDeadline,
      });
    }
    if (match.player1Id && match.player2Id) {
      this.botService
        .notifyMatchFound(match.player1Id, match.player2Id, Number(match.wagerAmount))
        .catch(() => undefined);
    }
    await this.broadcastStateToBothPlayers(matchId);
    this.schedulePlacementTimeout(matchId);
  }

  // ============= Лобби (приватные) =============

  @SubscribeMessage('lobby:join')
  async lobbyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code: string; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'lobby:join', 15)) {
      return { ok: false, error: 'Слишком много запросов' };
    }
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.lobbies.join(body.code.toUpperCase(), s.data.userId);
      // если хост — бот, расставляем его флот и фиксируем уровень игры
      await this.bots.prepareBotMatch(r.matchId);
      await this.notifyMatchFound(r.matchId);

      // Пуш-уведомление создателю лобби: кто-то принял его вызов
      // r.hostId приходит напрямую из lobby.join — надёжнее чем парсить match.player1/2
      const joiner = await this.prisma.user.findUnique({ where: { id: s.data.userId } });
      const joinerName = joiner?.username ?? joiner?.firstName ?? 'Соперник';
      const wagerMatch = await this.prisma.match.findUnique({ where: { id: r.matchId } });
      const wager = wagerMatch ? Number(wagerMatch.wagerAmount) : 0;
      this.botService.notifyLobbyJoined(r.hostId, joinerName, wager).catch((e) =>
        this.logger.warn(`notifyLobbyJoined failed: ${e?.message}`),
      );

      return { ok: true, matchId: r.matchId };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'lobby join error' };
    }
  }

  // ============= Расстановка =============

  @SubscribeMessage('game:placement')
  async placement(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: {
      matchId: string;
      ships: ShipPlacement[] | 'auto';
      nonce?: string;
    },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'game:placement', 20)) {
      return { ok: false, error: 'Слишком много запросов' };
    }
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      await this.assertNotBlocked(s.data.userId);
      const r = await this.game.submitPlacement(body.matchId, s.data.userId, body.ships);
      // оповещаем обоих о смене состояния
      await this.broadcastStateToBothPlayers(body.matchId);
      if (r.started) {
        // бой начался — снимаем таймер расстановки, запускаем таймер хода
        this.clearPlacementTimer(body.matchId);
        const gs = await this.prisma.gameState.findUnique({ where: { matchId: body.matchId } });
        this.scheduleTurnTimeout(body.matchId, gs?.turnDeadline ?? null);
        this.server.to(`match:${body.matchId}`).emit('match:start', {
          matchId: body.matchId,
          firstTurn: gs?.currentTurn ?? null,
          deadline: gs?.turnDeadline ?? null,
        });
        // если первый ход за ботом — пусть походит
        void this.driveBotIfNeeded(body.matchId);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'placement error' };
    }
  }

  // ============= Атака =============

  @SubscribeMessage('game:attack')
  async attack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId: string; x: number; y: number; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'game:attack', 30)) {
      return { ok: false, error: 'Слишком много ходов' };
    }
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      if (body.x < 0 || body.x > 9 || body.y < 0 || body.y > 9 || !Number.isInteger(body.x) || !Number.isInteger(body.y)) {
        return { ok: false, error: 'Invalid coordinates' };
      }
      const r = await this.game.attack(body.matchId, s.data.userId, body.x, body.y);
      // Игрок активен — сбрасываем его счётчик пропусков
      const afk = this.afkCounters.get(body.matchId);
      if (afk?.userId === s.data.userId) this.afkCounters.delete(body.matchId);
      // публичный ивент атаки (без раскрытия скрытых данных)
      this.server.to(`match:${body.matchId}`).emit('match:attack', {
        by: s.data.userId,
        x: body.x,
        y: body.y,
        hit: r.result.hit,
        sunk: r.result.sunk,
        sunkShip: r.result.sunkShip,
        nextTurn: r.nextTurn,
        gameStatus: r.gameStatus,
        winnerId: r.winnerId,
      });

      // обновляем состояние у каждого игрока (их view разный)
      await this.broadcastStateToBothPlayers(body.matchId);

      if (r.gameStatus === 'IN_PROGRESS') {
        const gs = await this.prisma.gameState.findUnique({ where: { matchId: body.matchId } });
        this.scheduleTurnTimeout(body.matchId, gs?.turnDeadline ?? null);
        // ход мог перейти к боту — запускаем его
        void this.driveBotIfNeeded(body.matchId);
      } else if (r.gameStatus === 'FINISHED') {
        this.clearTurnTimer(body.matchId);
        this.afkCounters.delete(body.matchId);
        this.bots.forgetMatch(body.matchId);
        const match = await this.prisma.match.findUnique({ where: { id: body.matchId } });
        this.server.to(`match:${body.matchId}`).emit('match:finished', {
          matchId: body.matchId,
          winnerId: r.winnerId,
          prizePool: match ? Number(match.prizePool) : 0,
          rakeAmount: match ? Number(match.rakeAmount) : 0,
        });
        // Обновить баланс обоих игроков через сокет
        if (match) {
          for (const uid of [match.player1Id, match.player2Id].filter(Boolean) as string[]) {
            const u = await this.prisma.user.findUnique({ where: { id: uid }, select: { balance: true } });
            if (u) this.server.to(`user:${uid}`).emit('wallet:update', Number(u.balance));
          }
        }
      }
      return { ok: true, result: r.result };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'attack error' };
    }
  }

  // ============= Сдаться =============

  @SubscribeMessage('game:surrender')
  async surrender(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId: string; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'game:surrender', 5, 60_000)) {
      return { ok: false, error: 'Слишком много запросов' };
    }
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.game.surrender(body.matchId, s.data.userId);
      if ((r as { cancelled?: boolean }).cancelled) {
        const match = await this.prisma.match.findUnique({ where: { id: body.matchId } });
        const payload = { matchId: body.matchId, reason: 'player_left' };
        this.server.to(`match:${body.matchId}`).emit('match:cancelled', payload);
        if (match) {
          for (const uid of [match.player1Id, match.player2Id].filter(Boolean) as string[]) {
            this.server.to(`user:${uid}`).emit('match:cancelled', payload);
          }
        }
      } else {
        await this.emitMatchFinished(body.matchId, r.winnerId ?? null);
        await this.broadcastStateToBothPlayers(body.matchId);
      }
      this.clearTurnTimer(body.matchId);
      this.afkCounters.delete(body.matchId);
      this.bots.forgetMatch(body.matchId);
      return { ok: true, cancelled: !!(r as { cancelled?: boolean }).cancelled };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'surrender error' };
    }
  }

  // ============= Запрос состояния =============

  @SubscribeMessage('match:requestState')
  async requestState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId: string },
  ) {
    const s = this.requireAuth(client);
    if (!this.checkSocketRate(s.data.userId, 'match:requestState', 30, 10_000)) {
      return { ok: false, error: 'Слишком много запросов' };
    }
    try {
      const state = await this.game.getStateForUser(body.matchId, s.data.userId);
      client.join(`match:${body.matchId}`);
      this.server.to(`user:${s.data.userId}`).emit('match:state', state);
      return { ok: true, state };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'state error' };
    }
  }

  // ============= Рематч =============

  @SubscribeMessage('match:rematch')
  async rematch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId: string; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    await this.ensureNonce(s.data.userId, body.nonce);

    const match = await this.prisma.match.findUnique({ where: { id: body.matchId } });
    if (!match || match.status !== 'FINISHED') return { ok: false, error: 'Match not finished' };
    if (match.isTraining) return { ok: false, error: 'Реванш недоступен в тренировке' };
    if (match.player1Id !== s.data.userId && match.player2Id !== s.data.userId) {
      return { ok: false, error: 'Not your match' };
    }
    if (!this.checkSocketRate(s.data.userId, 'match:rematch', 10, 60_000)) {
      return { ok: false, error: 'Слишком много запросов' };
    }

    const meIsP1 = match.player1Id === s.data.userId;
    const opponentId = meIsP1 ? match.player2Id : match.player1Id;
    if (!opponentId) return { ok: false, error: 'No opponent' };

    // Помечаем в Redis: rematch:<matchId>:<userId>
    const key = `rematch:${body.matchId}`;
    await this.redis.client.sadd(key, s.data.userId);
    await this.redis.client.expire(key, 120);

    const members = await this.redis.client.smembers(key);
    this.server.to(`match:${body.matchId}`).emit('match:rematchRequested', {
      by: s.data.userId,
      ready: members,
    });

    if (opponentId && !members.includes(opponentId)) {
      this.botService.notifyRematch(opponentId, s.data.userId).catch(() => undefined);
    }

    if (members.includes(match.player1Id) && members.includes(match.player2Id!)) {
      const wager = Number(match.wagerAmount);
      const [p1, p2] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: match.player1Id } }),
        this.prisma.user.findUnique({ where: { id: match.player2Id! } }),
      ]);
      if (!p1 || !p2 || Number(p1.balance) < wager || Number(p2.balance) < wager) {
        await this.redis.client.del(key);
        return { ok: false, error: 'Недостаточно средств для реванша' };
      }

      const newMatchId = await this.redis.withLock(`rematch:create:${body.matchId}`, 8000, async () => {
        const again = await this.redis.client.smembers(key);
        if (!again.includes(match.player1Id) || !again.includes(match.player2Id!)) {
          return null;
        }
        const newMatch = await this.game.createMatch(
          match.player1Id,
          match.player2Id!,
          Number(match.wagerAmount),
        );
        await this.bots.prepareBotMatch(newMatch.id);
        await this.redis.client.del(key);
        return newMatch.id;
      });

      if (!newMatchId) return { ok: true, waiting: true };

      await this.notifyMatchFound(newMatchId);
      this.server.to(`match:${body.matchId}`).emit('match:rematchStarted', {
        oldMatchId: body.matchId,
        newMatchId,
      });
      return { ok: true, newMatchId };
    }
    return { ok: true, waiting: true };
  }

  @SubscribeMessage('match:reaction')
  async reaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId: string; reaction: string; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    await this.ensureNonce(s.data.userId, body.nonce);

    const match = await this.prisma.match.findUnique({ where: { id: body.matchId } });
    if (!match || (match.player1Id !== s.data.userId && match.player2Id !== s.data.userId)) {
      return { ok: false, error: 'Not your match' };
    }
    if (!this.checkSocketRate(s.data.userId, 'match:reaction', 15, 10_000)) {
      return { ok: false, error: 'Слишком много реакций' };
    }
    const reaction = String(body.reaction ?? '').slice(0, 32);
    if (!reaction) return { ok: false, error: 'Empty reaction' };

    this.server.to(`match:${body.matchId}`).emit('match:reaction', {
      by: s.data.userId,
      reaction,
    });
    return { ok: true };
  }

  // ============= Heartbeat =============

  @SubscribeMessage('ping')
  pong() {
    return { pong: Date.now() };
  }
}
