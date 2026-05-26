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
    const lim = Math.min(Math.max(Number(limit ?? 50), 1), 200);
    return this.h.listForUser(u.sub, lim);
  }
}
