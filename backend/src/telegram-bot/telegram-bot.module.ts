import { Global, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';

@Global()
@Module({
  controllers: [TelegramController],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
