import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TelegramBotService } from './telegram-bot.service';

/**
 * Приёмник апдейтов Telegram при работе через webhook.
 * Telegram шлёт POST на этот адрес (TELEGRAM_WEBHOOK_URL должен указывать сюда,
 * напр. https://game.navalclash.ru/api/telegram/webhook) и передаёт секрет
 * в заголовке X-Telegram-Bot-Api-Secret-Token.
 */
@SkipThrottle()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly bot: TelegramBotService) {}

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Body() update: unknown,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    this.bot.processUpdate(update, secret);
    // Всегда отвечаем 200, иначе Telegram будет ретраить и копить очередь.
    return { ok: true };
  }
}
