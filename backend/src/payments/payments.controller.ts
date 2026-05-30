import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { AdminKeyGuard } from './admin-key.guard';

class DepositDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  amount!: number;
}

class ProcessDto {
  @IsString()
  @IsIn(['pay', 'reject'])
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Создать депозит: ссылка на оплату (CryptoBot) или мгновенное зачисление (демо). */
  @Post('deposit')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  deposit(@CurrentUser() u: JwtPayload, @Body() dto: DepositDto) {
    return this.payments.createDeposit(u.sub, dto.amount);
  }

  /** Вебхук Crypto Pay об оплате инвойса (подпись проверяется по сырому телу). */
  @Post('cryptobot/webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('crypto-pay-api-signature') signature: string,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    return this.payments.handleCryptoWebhook(raw, signature);
  }

  /** Админ: выплатить или отклонить заявку на вывод. */
  @Post('withdrawals/:id/process')
  @UseGuards(AdminKeyGuard)
  process(@Param('id') id: string, @Body() dto: ProcessDto) {
    return this.payments.processWithdrawal(id, dto.action as 'pay' | 'reject', dto.note);
  }
}
