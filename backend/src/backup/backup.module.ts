import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [TelegramBotModule],
  providers: [BackupService],
})
export class BackupModule {}
