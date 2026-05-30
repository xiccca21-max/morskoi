import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, IsIn, Min, Max, MaxLength } from 'class-validator';
import { AdminService } from './admin.service';
import { PaymentsService } from '../payments/payments.service';
import { AdminKeyGuard } from '../payments/admin-key.guard';

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
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
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
