import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly h: HistoryService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query('limit') limit?: string) {
    const n = Number(limit ?? 50);
    const lim = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 200) : 50;
    return this.h.listForUser(u.sub, lim);
  }

  @Get('stats/week')
  weekStats(@CurrentUser() u: JwtPayload) {
    return this.h.weeklyStats(u.sub);
  }
}
