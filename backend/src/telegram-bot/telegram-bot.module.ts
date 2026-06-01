import { Global, Module, forwardRef } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';

@Global()
@Module({
  imports: [forwardRef(() => MatchmakingModule)],
  controllers: [TelegramController],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
