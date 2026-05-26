import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('game')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private readonly game: GameService) {}

  @Get('active')
  active(@CurrentUser() u: JwtPayload) {
    return this.game.findActiveMatchForUser(u.sub);
  }

  @Get('state/:matchId')
  state(@CurrentUser() u: JwtPayload, @Param('matchId') matchId: string) {
    return this.game.getStateForUser(matchId, u.sub);
  }
}
