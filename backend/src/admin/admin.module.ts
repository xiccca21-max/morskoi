import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminPanelController } from './admin-panel.controller';
import { PaymentsModule } from '../payments/payments.module';
import { GameModule } from '../game/game.module';

@Module({
  imports: [PaymentsModule, GameModule],
  providers: [AdminService],
  controllers: [AdminController, AdminPanelController],
})
export class AdminModule {}
