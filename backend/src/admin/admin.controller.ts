import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, IsIn, Min, Max, MaxLength } from 'class-validator';
import { AdminService } from './admin.service';
import { PaymentsService } from '../payments/payments.service';
import { AdminKeyGuard } from '../payments/admin-key.guard';
import { AdminAlertService } from '../common/admin-alert.service';

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
  note?: string;
}

@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly payments: PaymentsService,
    private readonly alerts: AdminAlertService,
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('logs')
  logs(@Query('limit') limit?: string, @Query('action') action?: string) {
    return this.admin.listActionLogs(limit ? Number(limit) : 50, action || undefined);
  }

  @Get('activity')
  activity() {
    return this.admin.getLiveActivity();
  }

  @Get('alerts')
  alertsStatus() {
    return this.alerts.status();
  }

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
    return this.admin.listWithdrawals(status);
  }

  @Post('withdrawals/:id/process')
  process(@Param('id') id: string, @Body() dto: ProcessDto) {
    return this.payments.processWithdrawal(id, dto.action as 'pay' | 'reject', dto.note);
  }
}
