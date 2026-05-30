import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CryptoPayService } from './crypto-pay.service';

@Module({
  providers: [PaymentsService, CryptoPayService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
