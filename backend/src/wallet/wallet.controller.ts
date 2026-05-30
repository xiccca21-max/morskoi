import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsPositive, IsString, IsIn, MinLength } from 'class-validator';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

class AmountDto {
  @IsNumber()
  @IsPositive()
  amount!: number;
}

class WithdrawDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsIn(['CARD', 'TON', 'CRYPTO'])
  method!: string;

  @IsString()
  @MinLength(4)
  destination!: string;
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

  /**
   * Заглушка для пополнения. В проде сюда подключается провайдер
   * (Telegram Stars / TON / crypto-gateway). Здесь — демо-deposit для теста.
   */
  @Post('deposit')
  deposit(@CurrentUser() u: JwtPayload, @Body() dto: AmountDto) {
    return this.wallet
      .deposit(u.sub, dto.amount, { source: 'demo' }, true)
      .then((balance) => ({ balance }));
  }

  /** Создаёт заявку на вывод. Средства холдятся сразу, выплата — после обработки. */
  @Post('withdraw')
  withdraw(@CurrentUser() u: JwtPayload, @Body() dto: WithdrawDto) {
    return this.wallet.requestWithdrawal(u.sub, dto.amount, dto.method, dto.destination);
  }
}
