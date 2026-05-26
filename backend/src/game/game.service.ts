import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GameStatus, MatchStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import {
  applyAttack,
  autoPlace,
  buildPrivateBoard,
  emptyBoard,
  publicEnemyView,
  publicOwnView,
  validateBoard,
} from './engine/board';
import { PrivateBoard, ShipPlacement } from './engine/types';

// SQLite хранит JSON как TEXT — вокруг этих helper'ов мы сериализуем/десериализуем.
const J = {
  parse:  <T>(s: string | null | undefined, def: T): T => {
    if (!s) return def;
    try { return JSON.parse(s) as T; } catch { return def; }
  },
  stringify: (v: unknown): string => JSON.stringify(v),
};

/**
 * GameService — единственное место, где меняется состояние матча.
 * Все ходы — server-authoritative.
 */
@Injectable()
export class GameService {
  private readonly logger = new Logger('GameService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
  ) {}

  // ===== Создание матча из matchmaking / лобби =====

  async createMatch(p1Id: string, p2Id: string, wagerAmount: number) {
    if (p1Id === p2Id) throw new BadRequestException('Same user');
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          player1Id: p1Id,
          player2Id: p2Id,
          wagerAmount,
          prizePool: wagerAmount * 2,
          status: MatchStatus.PLACEMENT,
          startedAt: new Date(),
        },
      });
      await tx.gameState.create({
        data: {
          matchId: match.id,
          player1Board: J.stringify(emptyBoard()),
          player2Board: J.stringify(emptyBoard()),
          gameStatus: GameStatus.PLACEMENT,
          attackHistory: '[]',
        },
      });
      return match;
    });
  }

  async findActiveMatchForUser(userId: string) {
    return this.prisma.match.findFirst({
      where: {
        status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] },
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      include: { gameState: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===== Расстановка =====

  async submitPlacement(matchId: string, userId: string, ships: ShipPlacement[] | 'auto') {
    return this.redis.withLock(`match:${matchId}`, 4000, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { gameState: true },
      });
      if (!match || !match.gameState) throw new NotFoundException('Match not found');
      if (match.status !== MatchStatus.PLACEMENT) throw new BadRequestException('Not in placement phase');
      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ForbiddenException('Not your match');

      let finalShips: ShipPlacement[];
      if (ships === 'auto') {
        finalShips = autoPlace();
      } else {
        const v = validateBoard(ships);
        if (!v.ok) throw new BadRequestException(`Invalid placement: ${v.reason}`);
        finalShips = ships;
      }
      const board = buildPrivateBoard(finalShips);

      const otherBoardJson = isP1 ? match.gameState.player2Board : match.gameState.player1Board;
      const otherBoard = J.parse<PrivateBoard>(otherBoardJson as any, { ships: [], attacksReceived: [], placed: false });

      const bothReady = otherBoard.placed === true;

      // Если оба готовы — стартует бой; первым ходит player1.
      const updates: Prisma.GameStateUpdateInput = isP1
        ? { player1Board: J.stringify(board) }
        : { player2Board: J.stringify(board) };

      if (bothReady) {
        updates.gameStatus = GameStatus.IN_PROGRESS;
        updates.currentTurn = match.player1Id;
        updates.turnDeadline = new Date(Date.now() + Number(process.env.TURN_TIMEOUT_SEC ?? 20) * 1000);
      }

      await this.prisma.gameState.update({ where: { matchId }, data: updates });
      if (bothReady) {
        await this.prisma.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.IN_PROGRESS },
        });
        // Списываем ставку у обоих, только когда бой действительно начался.
        try {
          await this.wallet.lockWagerForMatch(
            matchId,
            match.player1Id,
            match.player2Id!,
            Number(match.wagerAmount),
          );
        } catch (e) {
          // если кто-то «успел потратить» — отменяем матч
          await this.cancelMatch(matchId, 'insufficient funds');
          throw e;
        }
      }

      return { ok: true, started: bothReady };
    });
  }

  // ===== Атака =====

  async attack(matchId: string, userId: string, x: number, y: number) {
    return this.redis.withLock(`match:${matchId}`, 5000, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { gameState: true },
      });
      if (!match || !match.gameState) throw new NotFoundException('Match not found');
      if (match.status !== MatchStatus.IN_PROGRESS) throw new BadRequestException('Match not in progress');
      const gs = match.gameState;
      if (gs.currentTurn !== userId) throw new ForbiddenException('Not your turn');

      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ForbiddenException('Not your match');

      const defenderKey: 'player1Board' | 'player2Board' = isP1 ? 'player2Board' : 'player1Board';
      const defenderBoard = J.parse<PrivateBoard>(gs[defenderKey] as any, { ships: [], attacksReceived: [], placed: false });

      const result = applyAttack(defenderBoard, x, y);

      const history = J.parse<any[]>(gs.attackHistory as any, []);
      history.push({
        by: userId,
        x,
        y,
        hit: result.hit,
        sunk: result.sunk,
        ts: Date.now(),
      });

      let nextTurn = gs.currentTurn;
      let newStatus = gs.gameStatus;
      let winnerId: string | null = null;

      if (result.gameOver) {
        newStatus = GameStatus.FINISHED;
        winnerId = userId;
      } else if (!result.hit) {
        // miss — передаём ход сопернику
        nextTurn = isP1 ? match.player2Id! : match.player1Id;
      }
      // hit — ход остаётся у атакующего

      const turnTimeoutSec = Number(process.env.TURN_TIMEOUT_SEC ?? 20);
      await this.prisma.gameState.update({
        where: { matchId },
        data: {
          [defenderKey]: J.stringify(defenderBoard),
          attackHistory: J.stringify(history),
          currentTurn: nextTurn,
          gameStatus: newStatus,
          turnDeadline: newStatus === GameStatus.IN_PROGRESS
            ? new Date(Date.now() + turnTimeoutSec * 1000)
            : null,
        },
      });

      if (newStatus === GameStatus.FINISHED && winnerId) {
        // выплачиваем
        const rake = Number(process.env.PLATFORM_RAKE_PERCENT ?? 5);
        await this.wallet.settleMatch(
          match.id,
          match.player1Id,
          match.player2Id!,
          Number(match.wagerAmount),
          winnerId,
          rake,
        );
      }

      return {
        result,
        nextTurn,
        gameStatus: newStatus,
        winnerId,
      };
    });
  }

  // ===== Сдаться =====

  async surrender(matchId: string, userId: string) {
    return this.redis.withLock(`match:${matchId}`, 4000, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { gameState: true },
      });
      if (!match || !match.gameState) throw new NotFoundException('Match not found');
      if (match.status === MatchStatus.FINISHED) return { winnerId: match.winnerId };
      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ForbiddenException('Not your match');

      const winnerId = isP1 ? match.player2Id! : match.player1Id;

      await this.prisma.gameState.update({
        where: { matchId },
        data: { gameStatus: GameStatus.FINISHED, currentTurn: null, turnDeadline: null },
      });

      // если матч ещё не начался (placement) — просто отменяем без выплат
      if (match.status === MatchStatus.PLACEMENT) {
        await this.prisma.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.CANCELLED, endedAt: new Date() },
        });
        return { winnerId: null, cancelled: true };
      }

      const rake = Number(process.env.PLATFORM_RAKE_PERCENT ?? 5);
      await this.wallet.settleMatch(
        match.id,
        match.player1Id,
        match.player2Id!,
        Number(match.wagerAmount),
        winnerId,
        rake,
      );
      return { winnerId };
    });
  }

  // ===== Тайм-аут хода =====

  async handleTurnTimeout(matchId: string) {
    return this.redis.withLock(`match:${matchId}`, 4000, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { gameState: true },
      });
      if (!match || !match.gameState) return null;
      if (match.status !== MatchStatus.IN_PROGRESS) return null;
      if (!match.gameState.turnDeadline || match.gameState.turnDeadline.getTime() > Date.now()) return null;

      // Засчитываем «промах» текущего игрока и передаём ход.
      // Альтернативно — можно считать поражением. Здесь — передача хода.
      const cur = match.gameState.currentTurn;
      const next = cur === match.player1Id ? match.player2Id! : match.player1Id;
      const turnTimeoutSec = Number(process.env.TURN_TIMEOUT_SEC ?? 20);
      await this.prisma.gameState.update({
        where: { matchId },
        data: {
          currentTurn: next,
          turnDeadline: new Date(Date.now() + turnTimeoutSec * 1000),
        },
      });
      return { nextTurn: next, timedOut: cur };
    });
  }

  // ===== Cancel при ошибках =====

  async cancelMatch(matchId: string, reason: string) {
    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.CANCELLED, endedAt: new Date() },
    });
    this.logger.warn(`Match ${matchId} cancelled: ${reason}`);
  }

  // ===== Просмотр состояния для игрока =====

  async getStateForUser(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { gameState: true },
    });
    if (!match || !match.gameState) throw new NotFoundException('Match not found');
    const isP1 = match.player1Id === userId;
    const isP2 = match.player2Id === userId;
    if (!isP1 && !isP2) throw new ForbiddenException('Not your match');

    const myBoard    = J.parse<PrivateBoard>(
      (isP1 ? match.gameState.player1Board : match.gameState.player2Board) as any,
      { ships: [], attacksReceived: [], placed: false },
    );
    const enemyBoard = J.parse<PrivateBoard>(
      (isP1 ? match.gameState.player2Board : match.gameState.player1Board) as any,
      { ships: [], attacksReceived: [], placed: false },
    );

    return {
      matchId: match.id,
      status: match.status,
      gameStatus: match.gameState.gameStatus,
      wagerAmount: Number(match.wagerAmount),
      prizePool: Number(match.prizePool),
      rakeAmount: Number(match.rakeAmount),
      winnerId: match.winnerId,
      currentTurn: match.gameState.currentTurn,
      turnDeadline: match.gameState.turnDeadline,
      me: {
        userId,
        own: publicOwnView(myBoard),
      },
      enemy: {
        userId: isP1 ? match.player2Id : match.player1Id,
        view: publicEnemyView(enemyBoard),
      },
      opponentReady: enemyBoard.placed === true,
    };
  }
}
