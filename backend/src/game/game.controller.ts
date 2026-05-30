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
  async active(@CurrentUser() u: JwtPayload) {
    const m = await this.game.findActiveMatchForUser(u.sub);
    if (!m) return null;
    // Возвращаем публичное состояние (matchId, gameStatus, ...) для фронта
    return this.game.getStateForUser(m.id, u.sub);
  }

  @Get('state/:matchId')
  state(@CurrentUser() u: JwtPayload, @Param('matchId') matchId: string) {
    return this.game.getStateForUser(matchId, u.sub);
  }
}
