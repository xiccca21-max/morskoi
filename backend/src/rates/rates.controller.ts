import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RatesService } from './rates.service';

@SkipThrottle()
@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  get() {
    return this.rates.get();
  }
}
