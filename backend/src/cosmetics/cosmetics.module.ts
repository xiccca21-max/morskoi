import { Module } from '@nestjs/common';
import { CosmeticsService } from './cosmetics.service';
import { CosmeticsController } from './cosmetics.controller';

@Module({
  providers: [CosmeticsService],
  controllers: [CosmeticsController],
  exports: [CosmeticsService],
})
export class CosmeticsModule {}
