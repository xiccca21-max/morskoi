import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsPositive } from 'class-validator';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

class AmountDto {
  @IsNumber()
  @IsPositive()
  amount!: number;
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  balance(@CurrentUser() u: JwtPayload) {
    return this.wallet.getBalance(u.sub).then((balance) => ({ balance }));
  }

  @Get('transactions')
  txs(@CurrentUser() u: JwtPayload) {
    return this.wallet.listTransactions(u.sub);
  }

  /**
   * Заглушка для пополнения. В проде сюда подключается провайдер
   * (Telegram Stars / TON / crypto-gateway). Здесь — демо-deposit для теста.
   */
  @Post('deposit')
  deposit(@CurrentUser() u: JwtPayload, @Body() dto: AmountDto) {
    return this.wallet
      .deposit(u.sub, dto.amount, { source: 'demo' })
      .then((balance) => ({ balance }));
  }

  @Post('withdraw')
  withdraw(@CurrentUser() u: JwtPayload, @Body() dto: AmountDto) {
    return this.wallet
      .withdraw(u.sub, dto.amount, { source: 'demo' })
      .then((balance) => ({ balance }));
  }
}
