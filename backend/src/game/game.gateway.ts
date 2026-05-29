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
import { ShipPlacement } from './engine/types';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

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
  // Счётчик подряд пропущенных ходов (AFK/дисконнект): matchId → { userId, count }
  private afkCounters = new Map<string, { userId: string; count: number }>();

  constructor(
    private readonly auth: AuthService,
    private readonly game: GameService,
    private readonly mm: MatchmakingService,
    private readonly lobbies: LobbyService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly botService: TelegramBotService,
  ) {}

  onModuleInit() {
    this.logger.log('Game gateway initialised');
  }

  // ============= Подключение =============

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.toString().replace('Bearer ', ''));
      if (!token) throw new Error('No token');
      const payload = await this.auth.verifyToken(token);
      (client as AuthedSocket).data = {
        userId: payload.sub,
        tgId: payload.tgId,
        username: payload.username,
      };
      this.userSockets.set(payload.sub, client.id);
      client.join(`user:${payload.sub}`);
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

  private async ensureNonce(userId: string, nonce?: string) {
    if (!nonce) return; // nonce необязателен, но рекомендуется
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
        const maxMissed = Number(process.env.AFK_FORFEIT_TIMEOUTS ?? 3);
        const prev = this.afkCounters.get(matchId);
        const count = prev && prev.userId === timedOut ? prev.count + 1 : 1;
        this.afkCounters.set(matchId, { userId: timedOut, count });

        if (count >= maxMissed) {
          this.afkCounters.delete(matchId);
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
        if (gs?.gameStatus === 'IN_PROGRESS') this.scheduleTurnTimeout(matchId, gs.turnDeadline ?? null);
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

  // ============= Matchmaking =============

  @SubscribeMessage('mm:join')
  async mmJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { wagerAmount: number; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.mm.enqueue(s.data.userId, body.wagerAmount);
      if (r.matched && r.matchId) {
        // оповещаем обоих
        await this.notifyMatchFound(r.matchId);
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
    const players = [match.player1Id, match.player2Id].filter(Boolean) as string[];
    for (const uid of players) {
      const sId = this.userSockets.get(uid);
      if (sId) {
        const sock = this.server.sockets.sockets.get(sId);
        sock?.join(`match:${matchId}`);
      }
      this.server.to(`user:${uid}`).emit('match:found', {
        matchId,
        wagerAmount: Number(match.wagerAmount),
        opponentId: uid === match.player1Id ? match.player2Id : match.player1Id,
      });
    }
    await this.broadcastStateToBothPlayers(matchId);
  }

  // ============= Лобби (приватные) =============

  @SubscribeMessage('lobby:join')
  async lobbyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code: string; nonce?: string },
  ) {
    const s = this.requireAuth(client);
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.lobbies.join(body.code.toUpperCase(), s.data.userId);
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
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.game.submitPlacement(body.matchId, s.data.userId, body.ships);
      // оповещаем обоих о смене состояния
      await this.broadcastStateToBothPlayers(body.matchId);
      if (r.started) {
        // запускаем таймер хода
        const gs = await this.prisma.gameState.findUnique({ where: { matchId: body.matchId } });
        this.scheduleTurnTimeout(body.matchId, gs?.turnDeadline ?? null);
        this.server.to(`match:${body.matchId}`).emit('match:start', {
          matchId: body.matchId,
          firstTurn: gs?.currentTurn ?? null,
          deadline: gs?.turnDeadline ?? null,
        });
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
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
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
      } else if (r.gameStatus === 'FINISHED') {
        this.clearTurnTimer(body.matchId);
        this.afkCounters.delete(body.matchId);
        const match = await this.prisma.match.findUnique({ where: { id: body.matchId } });
        this.server.to(`match:${body.matchId}`).emit('match:finished', {
          matchId: body.matchId,
          winnerId: r.winnerId,
          prizePool: match ? Number(match.prizePool) : 0,
          rakeAmount: match ? Number(match.rakeAmount) : 0,
        });
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
    await this.ensureNonce(s.data.userId, body.nonce);
    try {
      const r = await this.game.surrender(body.matchId, s.data.userId);
      this.server.to(`match:${body.matchId}`).emit('match:finished', {
        matchId: body.matchId,
        winnerId: r.winnerId,
        surrenderedBy: s.data.userId,
      });
      await this.broadcastStateToBothPlayers(body.matchId);
      this.clearTurnTimer(body.matchId);
      this.afkCounters.delete(body.matchId);
      return { ok: true };
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
    try {
      const state = await this.game.getStateForUser(body.matchId, s.data.userId);
      client.join(`match:${body.matchId}`);
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

    if (members.includes(match.player1Id) && members.includes(match.player2Id!)) {
      // оба согласны — создаём новый матч с теми же условиями
      const newMatch = await this.game.createMatch(
        match.player1Id,
        match.player2Id!,
        Number(match.wagerAmount),
      );
      await this.redis.client.del(key);
      await this.notifyMatchFound(newMatch.id);
      this.server.to(`match:${body.matchId}`).emit('match:rematchStarted', {
        oldMatchId: body.matchId,
        newMatchId: newMatch.id,
      });
      return { ok: true, newMatchId: newMatch.id };
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
    
    // Просто пересылаем эмоцию (или иконку) в комнату
    this.server.to(`match:${body.matchId}`).emit('match:reaction', {
      by: s.data.userId,
      reaction: body.reaction,
    });
    return { ok: true };
  }

  // ============= Heartbeat =============

  @SubscribeMessage('ping')
  pong() {
    return { pong: Date.now() };
  }
}
