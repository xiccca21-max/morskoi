import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomBytes } from 'crypto';
import { LobbyStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from '../game/game.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { RedisService } from '../redis/redis.service';
import { assertCanPlay } from '../common/responsible-gaming';
import { AuditService } from '../common/audit.service';

function genCode(len = 8) {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += a[bytes[i]! % a.length];
  return s;
}

@Injectable()
export class LobbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly moduleRef: ModuleRef,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private get bot(): TelegramBotService {
    return this.moduleRef.get(TelegramBotService, { strict: false });
  }

  async create(hostId: string, wagerAmount: number, isPublic = false) {
    const min = Number(process.env.MIN_WAGER ?? 100);
    const max = Number(process.env.MAX_WAGER ?? 10000);
    if (wagerAmount < min || wagerAmount > max) {
      throw new BadRequestException(`Wager must be between ${min} and ${max}`);
    }
    await assertCanPlay(this.prisma, hostId);

    const host = await this.prisma.user.findUnique({ where: { id: hostId } });
    if (!host) throw new NotFoundException('User not found');
    if (Number(host.balance) < wagerAmount) {
      throw new BadRequestException('Insufficient balance');
    }

    return this.createLobbyRecord(hostId, wagerAmount, isPublic, false);
  }

  /** Бесплатное тренировочное лобби — друг заходит по ссылке, без ставки. */
  async createTraining(hostId: string) {
    await assertCanPlay(this.prisma, hostId);
    const host = await this.prisma.user.findUnique({ where: { id: hostId } });
    if (!host) throw new NotFoundException('User not found');
    return this.createLobbyRecord(hostId, 0, false, true);
  }

  private async createLobbyRecord(hostId: string, wagerAmount: number, isPublic: boolean, isTraining: boolean) {
    // У одного игрока не может «висеть» несколько открытых лобби —
    // закрываем предыдущие, чтобы список не засорялся.
    await this.prisma.lobby.updateMany({
      where: { hostId, status: LobbyStatus.OPEN },
      data: { status: LobbyStatus.CLOSED },
    });

    let code = '';
    for (let i = 0; i < 5; i++) {
      code = genCode(8);
      const exists = await this.prisma.lobby.findUnique({ where: { code } });
      if (!exists) break;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 минут
    const lobby = await this.prisma.lobby.create({
      data: { code, hostId, wagerAmount, expiresAt, status: LobbyStatus.OPEN, isPublic, isTraining } as any,
    });
    this.audit.log(hostId, 'LOBBY_CREATE', {
      code,
      wagerAmount,
      isPublic,
      isTraining,
    });
    return lobby;
  }

  /**
   * Принять challenge: вызванный игрок (caller) создаёт приватное лобби и
   * уведомляет инициатора (opponentId), чтобы тот зашёл и принял бой.
   */
  async challenge(callerId: string, opponentId: string, wagerAmount: number) {
    if (callerId === opponentId) throw new BadRequestException('Нельзя вызвать самого себя');
    const opponent = await this.prisma.user.findUnique({ where: { id: opponentId } });
    if (!opponent) throw new NotFoundException('Соперник не найден');

    // create() уже делает проверки самоисключения/ставки/баланса и закрывает старые лобби
    const lobby = await this.create(callerId, wagerAmount, false);

    const caller = await this.prisma.user.findUnique({ where: { id: callerId } });
    const fromName = (caller as any)?.nickname || caller?.firstName || caller?.username || 'Соперник';
    void this.bot.notifyChallenge(opponentId, fromName, wagerAmount, lobby.code);
    return lobby;
  }

  /** Список открытых публичных боёв (для «Поиска матча»). */
  async listOpen(
    viewerId: string,
    opts: { minWager?: number; maxWager?: number; query?: string } = {},
  ) {
    const lobbies = (await this.prisma.lobby.findMany({
      where: {
        isPublic: true,
        isTraining: false,
        status: LobbyStatus.OPEN,
        expiresAt: { gt: new Date() },
        ...(opts.minWager != null || opts.maxWager != null
          ? {
              wagerAmount: {
                ...(opts.minWager != null ? { gte: opts.minWager } : {}),
                ...(opts.maxWager != null ? { lte: opts.maxWager } : {}),
              },
            }
          : {}),
      } as any,
      include: {
        host: { select: { id: true, username: true, firstName: true, avatar: true, wins: true, losses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) as any[];

    const q = (opts.query ?? '').trim().toLowerCase();
    return lobbies
      .filter((l: any) => {
        if (!q) return true;
        const name = `${l.host.firstName ?? ''} ${l.host.username ?? ''}`.toLowerCase();
        return name.includes(q);
      })
      .map((l: any) => ({
        id: l.id,
        code: l.code,
        wagerAmount: Number(l.wagerAmount),
        isTraining: !!l.isTraining,
        createdAt: l.createdAt,
        isMine: l.hostId === viewerId,
        host: {
          id: l.host.id,
          username: l.host.username,
          firstName: l.host.firstName,
          avatar: l.host.avatar,
          wins: l.host.wins,
          losses: l.host.losses,
        },
      }));
  }

  /** Снять собственный открытый бой со списка. */
  async cancelMine(hostId: string) {
    await this.prisma.lobby.updateMany({
      where: { hostId, status: LobbyStatus.OPEN },
      data: { status: LobbyStatus.CLOSED },
    });
    return { ok: true };
  }

  async join(code: string, joinerId: string) {
    const normalized = code.toUpperCase();
    return this.redis.withLock(`lobby:join:${normalized}`, 8000, async () => {
      const lobby = await this.prisma.lobby.findUnique({ where: { code: normalized } });
      if (!lobby) throw new NotFoundException('Lobby not found');
      if (lobby.status !== LobbyStatus.OPEN) throw new BadRequestException('Lobby is not open');
      if (lobby.hostId === joinerId) throw new BadRequestException('Cannot join own lobby');
      if (lobby.expiresAt < new Date()) throw new BadRequestException('Lobby expired');

      await assertCanPlay(this.prisma, joinerId);

      const joiner = await this.prisma.user.findUnique({ where: { id: joinerId } });
      if (!joiner) throw new NotFoundException('User not found');
      const isTraining = !!(lobby as any).isTraining;
      if (!isTraining && Number(joiner.balance) < Number(lobby.wagerAmount)) {
        throw new BadRequestException('Insufficient balance');
      }

      // Атомарно «забираем» лобби — второй joiner получит 0 rows.
      const claimed = await this.prisma.lobby.updateMany({
        where: { id: lobby.id, status: LobbyStatus.OPEN },
        data: { status: LobbyStatus.STARTED },
      });
      if (claimed.count !== 1) throw new BadRequestException('Lobby is not open');

      const host = await this.prisma.user.findUnique({ where: { id: lobby.hostId } });
      if (!host) {
        await this.prisma.lobby.updateMany({
          where: { id: lobby.id, status: LobbyStatus.STARTED, matchId: null },
          data: { status: LobbyStatus.CLOSED },
        });
        throw new BadRequestException('Host not found');
      }
      if (!isTraining && Number(host.balance) < Number(lobby.wagerAmount)) {
        await this.prisma.lobby.updateMany({
          where: { id: lobby.id, status: LobbyStatus.STARTED, matchId: null },
          data: { status: LobbyStatus.CLOSED },
        });
        throw new BadRequestException('Insufficient balance');
      }

      try {
        const match = isTraining
          ? await this.game.createTrainingMatch(lobby.hostId, joinerId)
          : await this.game.createMatch(lobby.hostId, joinerId, Number(lobby.wagerAmount));
        await this.prisma.lobby.update({
          where: { id: lobby.id },
          data: { matchId: match.id },
        });
        this.audit.log(joinerId, 'LOBBY_JOIN', {
          code: normalized,
          matchId: match.id,
          hostId: lobby.hostId,
          isTraining,
          wagerAmount: Number(lobby.wagerAmount),
        });
        return { matchId: match.id, hostId: lobby.hostId, joinerId };
      } catch (e) {
        await this.prisma.lobby.updateMany({
          where: { id: lobby.id, status: LobbyStatus.STARTED, matchId: null },
          data: { status: LobbyStatus.OPEN },
        });
        throw e;
      }
    });
  }

  async get(code: string) {
    const l = await this.prisma.lobby.findUnique({
      where: { code },
      include: { host: { select: { id: true, username: true, firstName: true, avatar: true } } },
    });
    if (!l) throw new NotFoundException('Lobby not found');
    return {
      id: l.id,
      code: l.code,
      wagerAmount: Number(l.wagerAmount),
      isTraining: !!(l as any).isTraining,
      status: l.status,
      matchId: l.matchId,
      host: l.host,
      expiresAt: l.expiresAt,
    };
  }

  /** Открытое приватное лобби хоста (для ссылок-приглашений). */
  async getOpenByHost(hostId: string) {
    const l = await this.prisma.lobby.findFirst({
      where: {
        hostId,
        status: LobbyStatus.OPEN,
        expiresAt: { gt: new Date() },
        isPublic: false,
      } as any,
      orderBy: { createdAt: 'desc' },
      include: { host: { select: { id: true, username: true, firstName: true, avatar: true } } },
    });
    if (!l) throw new NotFoundException('Нет активного приглашения — попроси друга отправить новую ссылку');
    return {
      code: l.code,
      wagerAmount: Number(l.wagerAmount),
      isTraining: !!(l as any).isTraining,
      host: l.host,
    };
  }
}
