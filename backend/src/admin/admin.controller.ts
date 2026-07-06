import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsNumber, IsOptional, IsString, IsIn, Min, Max, MaxLength, MinLength } from 'class-validator';
import { AdminService } from './admin.service';
import { PaymentsService } from '../payments/payments.service';
import { AdminKeyGuard } from '../payments/admin-key.guard';
import { AdminAlertService } from '../common/admin-alert.service';
import { BotsService } from '../bots/bots.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

class CreditDto {
  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  amount!: number; // + начислить, − списать

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  withdrawable?: boolean;
}

class BanDto {
  @IsBoolean()
  banned!: boolean;
}

class ProcessDto {
  @IsString()
  @IsIn(['pay', 'reject'])
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

class BroadcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  @IsOptional()
  @IsBoolean()
  withPlay?: boolean;
}

@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly payments: PaymentsService,
    private readonly alerts: AdminAlertService,
    private readonly bots: BotsService,
    private readonly telegram: TelegramBotService,
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('logs')
  logs(@Query('limit') limit?: string, @Query('action') action?: string) {
    const n = Number(limit ?? 50);
    const lim = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 200) : 50;
    return this.admin.listActionLogs(lim, action || undefined);
  }

  @Get('activity')
  activity() {
    return this.admin.getLiveActivity();
  }

  @Get('alerts')
  alertsStatus() {
    return this.alerts.status();
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('alerts/test')
  async alertsTest() {
    return this.alerts.sendTest();
  }

  @Get('users')
  users(@Query('q') q?: string) {
    return this.admin.listUsers(q);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/credit')
  credit(@Param('id') id: string, @Body() dto: CreditDto) {
    return this.admin.credit(id, dto.amount, dto.reason ?? '', dto.withdrawable ?? false);
  }

  @Post('users/:id/ban')
  ban(@Param('id') id: string, @Body() dto: BanDto) {
    return this.admin.setBan(id, dto.banned);
  }

  @Get('withdrawals')
  withdrawals(@Query('status') status?: string) {
    const allowed = ['PENDING', 'PAID', 'REJECTED'];
    const s = status && allowed.includes(status) ? status : undefined;
    return this.admin.listWithdrawals(s);
  }

  @Post('withdrawals/:id/process')
  process(@Param('id') id: string, @Body() dto: ProcessDto) {
    return this.payments.processWithdrawal(id, dto.action as 'pay' | 'reject', dto.note);
  }

  @Post('bots/sync')
  async botsSync() {
    await this.bots.ensureBots();
    return { ok: true, message: 'Bot pool synced' };
  }

  @Get('broadcast/audience')
  async broadcastAudience() {
    const count = await this.telegram.countBroadcastAudience();
    return { count };
  }

  /** Рассылка в личку всем игрокам (кто хоть раз запускал бота). Не чаще 2 раз в час. */
  @Throttle({ default: { limit: 2, ttl: 3_600_000 } })
  @Post('broadcast')
  async broadcast(@Body() dto: BroadcastDto) {
    const result = await this.telegram.broadcastToAllUsers(dto.text, dto.withPlay ?? true);
    await this.admin.logBroadcast(dto.text, result);
    return { ok: true, ...result };
  }
}
