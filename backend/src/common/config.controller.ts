import { Controller, Get } from '@nestjs/common';

/** Публичные игровые константы для клиента (без секретов). */
@Controller('config')
export class ConfigController {
  @Get()
  get() {
    return {
      minWager: Number(process.env.MIN_WAGER ?? 100),
      // 0 = без фиксированного потолка: клиент ограничивает ставку балансом игрока.
      maxWager: Number(process.env.MAX_WAGER ?? 0),
      minWithdraw: Number(process.env.MIN_WITHDRAW ?? 1000),
      minDeposit: Number(process.env.MIN_DEPOSIT ?? 0),
      maxDeposit: Number(process.env.MAX_DEPOSIT ?? 100_000),
      platformRakePercent: Number(process.env.PLATFORM_RAKE_PERCENT ?? 5),
      afkForfeitTimeouts: Number(process.env.AFK_FORFEIT_TIMEOUTS ?? 2),
      placementTimeoutSec: Number(process.env.PLACEMENT_TIMEOUT_SEC ?? 60),
      turnTimeoutSec: Number(process.env.TURN_TIMEOUT_SEC ?? 20),
      mmFlexWaitSec: Number(process.env.MM_FLEX_WAIT_SEC ?? 30),
      mmFlexPct: Number(process.env.MM_FLEX_PCT ?? 0.1),
      build: process.env.APP_RELEASE || process.env.GIT_SHA || null,
    };
  }
}
