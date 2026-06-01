import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GameService } from './game.service';
import { BotsService } from '../bots/bots.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('game')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(
    private readonly game: GameService,
    private readonly bots: BotsService,
  ) {}

  @Get('active')
  async active(@CurrentUser() u: JwtPayload) {
    const m = await this.game.findActiveMatchForUser(u.sub);
    if (!m) return null;
    return this.game.getStateForUser(m.id, u.sub);
  }

  @Get('state/:matchId')
  state(@CurrentUser() u: JwtPayload, @Param('matchId') matchId: string) {
    return this.game.getStateForUser(matchId, u.sub);
  }

  @Post('training/bot')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  startBotTest(@CurrentUser() u: JwtPayload) {
    return this.bots.startBotTest(u.sub);
  }
}
