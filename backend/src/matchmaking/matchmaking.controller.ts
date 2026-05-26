import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsPositive, IsString, Length } from 'class-validator';
import { MatchmakingService } from './matchmaking.service';
import { LobbyService } from './lobby.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

class WagerDto {
  @IsNumber()
  @IsPositive()
  wagerAmount!: number;
}

class CodeDto {
  @IsString()
  @Length(4, 10)
  code!: string;
}

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(
    private readonly mm: MatchmakingService,
    private readonly lobbies: LobbyService,
  ) {}

  @Post('queue')
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
  createLobby(@CurrentUser() u: JwtPayload, @Body() dto: WagerDto) {
    return this.lobbies.create(u.sub, dto.wagerAmount);
  }

  @Post('lobby/join')
  joinLobby(@CurrentUser() u: JwtPayload, @Body() dto: CodeDto) {
    return this.lobbies.join(dto.code.toUpperCase(), u.sub);
  }

  @Get('lobby/:code')
  getLobby(@Param('code') code: string) {
    return this.lobbies.get(code.toUpperCase());
  }
}
