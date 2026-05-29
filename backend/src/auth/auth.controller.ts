import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString()
  initData!: string;
}

class DevLoginDto {
  @IsString()
  nickname!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('telegram')
  async telegram(@Body() dto: LoginDto) {
    return this.auth.loginWithTelegram(dto.initData);
  }

  @Post('dev')
  async dev(@Body() dto: DevLoginDto) {
    return this.auth.loginDev(dto.nickname);
  }
}
