import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsPositive, IsString, IsIn, Max, MaxLength, MinLength } from 'class-validator';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { USDT_NETWORK_IDS } from './withdraw.constants';

class WithdrawDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsString()
  @IsIn(USDT_NETWORK_IDS)
  network!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  address!: string;
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  balance(@CurrentUser() u: JwtPayload) {
    return this.wallet.getWallet(u.sub);
  }

  @Get('transactions')
  txs(@CurrentUser() u: JwtPayload) {
    return this.wallet.listTransactions(u.sub);
  }

  @Get('withdrawals')
  withdrawals(@CurrentUser() u: JwtPayload) {
    return this.wallet.listWithdrawals(u.sub);
  }

  @Get('withdraw/networks')
  withdrawNetworks() {
    return this.wallet.listWithdrawNetworks();
  }

  /** Создаёт заявку на вывод USDT. Средства холдятся сразу, выплата — до 24 ч. */
  @Post('withdraw')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  withdraw(@CurrentUser() u: JwtPayload, @Body() dto: WithdrawDto) {
    return this.wallet.requestWithdrawal(u.sub, dto.amount, dto.network, dto.address);
  }
}
