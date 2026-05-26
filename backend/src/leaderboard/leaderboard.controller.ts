import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly lb: LeaderboardService) {}

  @Get()
  top(@Query('type') type?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Math.max(Number(limit ?? 50), 1), 200);
    return type === 'earnings' ? this.lb.topByEarnings(lim) : this.lb.topByWins(lim);
  }
}
