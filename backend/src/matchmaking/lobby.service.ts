import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LobbyStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from '../game/game.service';

function genCode(len = 6) {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

@Injectable()
export class LobbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
  ) {}

  async create(hostId: string, wagerAmount: number, isPublic = false) {
    const min = Number(process.env.MIN_WAGER ?? 1);
    const max = Number(process.env.MAX_WAGER ?? 10000);
    if (wagerAmount < min || wagerAmount > max) {
      throw new BadRequestException(`Wager must be between ${min} and ${max}`);
    }
    const host = await this.prisma.user.findUnique({ where: { id: hostId } });
    if (!host) throw new NotFoundException('User not found');
    if (Number(host.balance) < wagerAmount) {
      throw new BadRequestException('Insufficient balance');
    }

    // У одного игрока не может «висеть» несколько открытых лобби —
    // закрываем предыдущие, чтобы список не засорялся.
    await this.prisma.lobby.updateMany({
      where: { hostId, status: LobbyStatus.OPEN },
      data: { status: LobbyStatus.CLOSED },
    });

    let code = '';
    for (let i = 0; i < 5; i++) {
      code = genCode(6);
      const exists = await this.prisma.lobby.findUnique({ where: { code } });
      if (!exists) break;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 минут
    const lobby = await this.prisma.lobby.create({
      // isPublic — новое поле; каст до регенерации Prisma Client в проде
      data: { code, hostId, wagerAmount, expiresAt, status: LobbyStatus.OPEN, isPublic } as any,
    });
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
    const lobby = await this.prisma.lobby.findUnique({ where: { code } });
    if (!lobby) throw new NotFoundException('Lobby not found');
    if (lobby.status !== LobbyStatus.OPEN) throw new BadRequestException('Lobby is not open');
    if (lobby.hostId === joinerId) throw new BadRequestException('Cannot join own lobby');
    if (lobby.expiresAt < new Date()) throw new BadRequestException('Lobby expired');

    const joiner = await this.prisma.user.findUnique({ where: { id: joinerId } });
    if (!joiner) throw new NotFoundException('User not found');
    if (Number(joiner.balance) < Number(lobby.wagerAmount)) {
      throw new BadRequestException('Insufficient balance');
    }

    const match = await this.game.createMatch(lobby.hostId, joinerId, Number(lobby.wagerAmount));

    await this.prisma.lobby.update({
      where: { id: lobby.id },
      data: { status: LobbyStatus.STARTED, matchId: match.id },
    });

    return { matchId: match.id, hostId: lobby.hostId, joinerId };
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
      status: l.status,
      matchId: l.matchId,
      host: l.host,
      expiresAt: l.expiresAt,
    };
  }
}
