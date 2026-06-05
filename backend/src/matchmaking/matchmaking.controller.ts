import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Length, Max } from 'class-validator';
import { MatchmakingService } from './matchmaking.service';
import { LobbyService } from './lobby.service';
import { MatchEventsService } from '../common/match-events.service';
import { BotsService } from '../bots/bots.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

class WagerDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  wagerAmount!: number;
}

class CodeDto {
  @IsString()
  @Length(4, 10)
  code!: string;
}

class CreateLobbyDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  wagerAmount!: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

class ChallengeDto {
  @IsString()
  opponentId!: string;

  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  wagerAmount!: number;
}

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(
    private readonly mm: MatchmakingService,
    private readonly lobbies: LobbyService,
    private readonly matchEvents: MatchEventsService,
    private readonly bots: BotsService,
    private readonly tg: TelegramBotService,
  ) {}

  @Post('queue')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  enqueue(@CurrentUser() u: JwtPayload, @Body() dto: WagerDto) {
    return this.mm.enqueue(u.sub, dto.wagerAmount);
  }

  @Delete('queue')
  leave(@CurrentUser() u: JwtPayload) {
    return this.mm.leave(u.sub);
  }

  @Get('queue/status')
  status(@CurrentUser() u: JwtPayload) {
    return this.mm.getQueueStatus(u.sub);
  }

  @Post('lobby')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  createLobby(@CurrentUser() u: JwtPayload, @Body() dto: CreateLobbyDto) {
    return this.lobbies.create(u.sub, dto.wagerAmount, dto.isPublic ?? false);
  }

  @Post('training/lobby')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  createTrainingLobby(@CurrentUser() u: JwtPayload) {
    return this.lobbies.createTraining(u.sub);
  }

  @Post('lobby/join')
  async joinLobby(@CurrentUser() u: JwtPayload, @Body() dto: CodeDto) {
    const r = await this.lobbies.join(dto.code.toUpperCase(), u.sub);
    await this.bots.prepareBotMatch(r.matchId);
    void this.matchEvents.notifyMatchFound(r.matchId);
    // Лобби бота поглощено — сразу создаём замену, чтобы список не показывал «протухший» бой.
    void this.bots.lobbyFillTick().catch(() => undefined);
    return r;
  }

  // Принять вызов по deep-link challenge_<id>: создаёт лобби и зовёт инициатора
  @Post('challenge')
  challenge(@CurrentUser() u: JwtPayload, @Body() dto: ChallengeDto) {
    return this.lobbies.challenge(u.sub, dto.opponentId, dto.wagerAmount);
  }

  // Список открытых публичных боёв (для экрана «Поиск матча»)
  @Get('open')
  listOpen(
    @CurrentUser() u: JwtPayload,
    @Query('min') min?: string,
    @Query('max') max?: string,
    @Query('q') q?: string,
  ) {
    return this.lobbies.listOpen(u.sub, {
      minWager: min != null && min !== '' ? Number(min) : undefined,
      maxWager: max != null && max !== '' ? Number(max) : undefined,
      query: q,
    });
  }

  @Delete('open')
  cancelOpen(@CurrentUser() u: JwtPayload) {
    return this.lobbies.cancelMine(u.sub);
  }

  /** Активное лобби хоста (legacy deep-link challenge_<hostId>). */
  @Get('lobby/host/:userId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  getHostLobby(@CurrentUser() u: JwtPayload, @Param('userId') userId: string) {
    return this.lobbies.getOpenByHost(userId, u.sub);
  }

  @Get('lobby/:code')
  getLobby(@Param('code') code: string) {
    return this.lobbies.get(code.toUpperCase());
  }

  /**
   * Отправляет хосту лобби карточку-приглашение через бота с кнопкой «⚔️ Принять бой».
   * Хост пересылает её другу — тот нажимает кнопку и попадает прямо в лобби.
   */
  @Post('lobby/:code/invite-card')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendInviteCard(@CurrentUser() u: JwtPayload, @Param('code') code: string) {
    const lobby = await this.lobbies.get(code.toUpperCase());
    if (!lobby || lobby.host?.id !== u.sub) {
      throw new ForbiddenException('Только хост лобби может отправить карточку');
    }
    if (lobby.status !== 'OPEN') {
      throw new BadRequestException('Лобби уже закрыто — создайте новое приглашение');
    }
    await this.tg.sendLobbyCard(u.sub, code.toUpperCase(), lobby.isTraining ?? false, lobby.wagerAmount);
    return { ok: true };
  }
}
