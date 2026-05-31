import { Controller, Get } from '@nestjs/common';

/** Публичные игровые константы для клиента (без секретов). */
@Controller('config')
export class ConfigController {
  @Get()
  get() {
    return {
      minWager: Number(process.env.MIN_WAGER ?? 100),
      maxWager: Number(process.env.MAX_WAGER ?? 10000),
      minWithdraw: Number(process.env.MIN_WITHDRAW ?? 100),
      placementTimeoutSec: Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60),
      turnTimeoutSec: Number(process.env.TURN_TIMEOUT_SEC ?? 20),
      mmFlexWaitSec: Number(process.env.MM_FLEX_WAIT_SEC ?? 30),
      mmFlexPct: Number(process.env.MM_FLEX_PCT ?? 0.1),
    };
  }
}
