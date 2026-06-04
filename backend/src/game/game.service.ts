import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { GameStatus, LobbyStatus, MatchStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { AuditService } from '../common/audit.service';
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
    private readonly audit: AuditService,
  ) {}

  // ===== Создание матча из matchmaking / лобби =====

  async createMatch(p1Id: string, p2Id: string, wagerAmount: number) {
    if (p1Id === p2Id) throw new BadRequestException('Same user');
    return this.createMatchInternal(p1Id, p2Id, wagerAmount, false);
  }

  /** Бесплатная тренировка против бота — без ставки и без влияния на статистику. */
  async createTrainingMatch(p1Id: string, p2Id: string) {
    if (p1Id === p2Id) throw new BadRequestException('Same user');
    return this.createMatchInternal(p1Id, p2Id, 0, true);
  }

  private async createMatchInternal(p1Id: string, p2Id: string, wagerAmount: number, isTraining: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          player1Id: p1Id,
          player2Id: p2Id,
          wagerAmount,
          prizePool: isTraining ? 0 : wagerAmount * 2,
          isTraining,
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
      await tx.lobby.updateMany({
        where: { hostId: { in: [p1Id, p2Id] }, status: LobbyStatus.OPEN },
        data: { status: LobbyStatus.CLOSED },
      });
      this.audit.log(p1Id, 'MATCH_CREATED', {
        matchId: match.id,
        p2Id,
        wagerAmount,
        isTraining,
      });
      return match;
    });
  }

  /**
   * Тайм-аут фазы расстановки: если бой так и не начался (кто-то не расставил
   * флот), отменяем матч. Ставка ещё не списана — возврат не нужен.
   * Возвращает список игроков, которым надо разослать отмену.
   */
  async handlePlacementTimeout(matchId: string) {
    return this.redis.withLock(`match:${matchId}`, 4000, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { gameState: true },
      });
      if (!match || !match.gameState) return null;
      if (match.status !== MatchStatus.PLACEMENT) return null; // уже стартовал/завершён

      await this.prisma.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.CANCELLED, endedAt: new Date() },
      });
      await this.prisma.gameState.update({
        where: { matchId },
        data: { gameStatus: GameStatus.FINISHED },
      });
      this.logger.warn(`Match ${matchId} cancelled: placement timeout`);
      this.audit.log(match.player1Id, 'MATCH_CANCELLED', { matchId, reason: 'placement_timeout' });
      return { players: [match.player1Id, match.player2Id].filter(Boolean) as string[] };
    });
  }

  async findActiveMatchForUser(userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] },
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      include: { gameState: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!match) return null;
    // Таймеры расстановки/хода живут в памяти и теряются при рестарте сервера.
    // Если матч «завис» (давно просрочен) — закрываем его, чтобы не висела
    // кнопка «Вернуться в бой» и можно было начать новый.
    if (await this.resolveIfStale(match)) return null;
    return match;
  }

  /**
   * Закрывает «зависший» матч (сервер перезапускался, таймеры пропали).
   * PLACEMENT — отмена по тайм-ауту расстановки; IN_PROGRESS — поражение
   * того, чей ход (он явно покинул игру). Возвращает true, если закрыт.
   */
  private async resolveIfStale(match: {
    id: string;
    status: string;
    startedAt: Date | null;
    gameState: { turnDeadline: Date | null; currentTurn: string | null } | null;
  }): Promise<boolean> {
    const now = Date.now();

    if (match.status === MatchStatus.PLACEMENT) {
      const placementSec = Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60);
      const deadline = (match.startedAt?.getTime() ?? now) + (placementSec + 30) * 1000;
      if (now > deadline) {
        await this.handlePlacementTimeout(match.id).catch(() => undefined);
        this.logger.warn(`Stale PLACEMENT match ${match.id} cancelled (server restart)`);
        return true;
      }
      return false;
    }

    // IN_PROGRESS
    const gs = match.gameState;
    if (!gs?.turnDeadline) return false;
    const turnSec = Number(process.env.TURN_TIMEOUT_SEC ?? 20);
    // Большой запас, чтобы не закрыть живой матч во время обычного дисконнекта.
    const graceMs = Math.max(180, turnSec * 4) * 1000;
    if (now > gs.turnDeadline.getTime() + graceMs) {
      if (gs.currentTurn) {
        await this.surrender(match.id, gs.currentTurn).catch(() => undefined);
      } else {
        await this.cancelMatch(match.id, 'abandoned_recovery').catch(() => undefined);
      }
      this.logger.warn(`Stale IN_PROGRESS match ${match.id} resolved (server restart)`);
      return true;
    }
    return false;
  }

  /** Периодическая чистка зависших матчей — освобождает игроков даже без их запроса. */
  @Cron('*/2 * * * *')
  async sweepStaleMatches() {
    const active = await this.prisma.match.findMany({
      where: { status: { in: [MatchStatus.PLACEMENT, MatchStatus.IN_PROGRESS] } },
      include: { gameState: true },
      take: 200,
    });
    for (const m of active) {
      try {
        await this.resolveIfStale(m);
      } catch (e: any) {
        this.logger.warn(`sweepStaleMatches: ${e?.message}`);
      }
    }
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

      // Защита от повторной расстановки: нельзя переставлять уже зафиксированный флот.
      const ownBoardJson = isP1 ? match.gameState.player1Board : match.gameState.player2Board;
      const ownBoard = J.parse<PrivateBoard>(ownBoardJson as any, { ships: [], attacksReceived: [], placed: false });
      if (ownBoard.placed === true) {
        throw new BadRequestException('Флот уже расставлен');
      }

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
        if (!match.isTraining) {
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
        this.audit.log(match.player1Id, 'MATCH_STARTED', {
          matchId,
          wagerAmount: Number(match.wagerAmount),
          isTraining: match.isTraining,
          p2Id: match.player2Id,
        });
      }

      return { ok: true, started: bothReady };
    });
  }

  // ===== Атака =====

  async attack(matchId: string, userId: string, x: number, y: number) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 9 || y < 0 || y > 9) {
      throw new BadRequestException('Invalid coordinates');
    }
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

      if (result.gameOver) {
        newStatus = GameStatus.FINISHED;
        winnerId = userId;
        if (match.isTraining) {
          await this.finishTrainingMatch(match.id, winnerId);
        } else {
          const rake = Number(process.env.PLATFORM_RAKE_PERCENT ?? 5);
          await this.wallet.settleMatch(
            match.id,
            match.player1Id,
            match.player2Id!,
            Number(match.wagerAmount),
            winnerId,
            rake,
          );
          this.audit.log(winnerId, 'MATCH_FINISHED', {
            matchId: match.id,
            winnerId,
            wagerAmount: Number(match.wagerAmount),
            isTraining: false,
          });
        }
      }

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

      if (match.isTraining) {
        await this.finishTrainingMatch(match.id, winnerId);
        return { winnerId };
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
      this.audit.log(winnerId, 'MATCH_FINISHED', {
        matchId: match.id,
        winnerId,
        wagerAmount: Number(match.wagerAmount),
        isTraining: false,
        surrenderedBy: userId,
      });
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

  private async finishTrainingMatch(matchId: string, winnerId: string | null) {
    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.FINISHED, winnerId, endedAt: new Date() },
    });
    await this.prisma.lobby.updateMany({
      where: { matchId },
      data: { status: LobbyStatus.CLOSED },
    });
    this.audit.log(winnerId, 'MATCH_FINISHED', { matchId, winnerId, isTraining: true });
  }

  // ===== Cancel при ошибках =====

  async cancelMatch(matchId: string, reason: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    // Возврат заблокированных ставок (no-op, если ставка ещё не списана или матч тренировочный).
    if (match && !match.isTraining) {
      await this.wallet.refundMatchWagers(matchId).catch((e) =>
        this.logger.warn(`refundMatchWagers ${matchId}: ${e?.message}`),
      );
    }
    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.CANCELLED, endedAt: new Date() },
    });
    await this.prisma.gameState.updateMany({
      where: { matchId },
      data: { gameStatus: GameStatus.FINISHED, currentTurn: null, turnDeadline: null },
    });
    this.logger.warn(`Match ${matchId} cancelled: ${reason}`);
    this.audit.log(match?.player1Id ?? null, 'MATCH_CANCELLED', { matchId, reason });
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

    const placementSec = Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60);
    const matchOver =
      match.status === MatchStatus.FINISHED || match.status === MatchStatus.CANCELLED;
    const gameStatus = matchOver ? GameStatus.FINISHED : match.gameState.gameStatus;
    const placementDeadline =
      !matchOver && match.status === MatchStatus.PLACEMENT && match.startedAt
        ? new Date(match.startedAt.getTime() + placementSec * 1000)
        : null;

    return {
      matchId: match.id,
      status: match.status,
      gameStatus,
      wagerAmount: Number(match.wagerAmount),
      prizePool: Number(match.prizePool),
      rakeAmount: Number(match.rakeAmount),
      isTraining: match.isTraining,
      winnerId: match.winnerId,
      currentTurn: match.gameState.currentTurn,
      turnDeadline: match.gameState.turnDeadline,
      placementDeadline,
      placementStartedAt: match.startedAt,
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
