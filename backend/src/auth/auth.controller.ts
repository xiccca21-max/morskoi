import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './auth.service';

class LoginDto {
  @IsString()
  initData!: string;
}

class DevLoginDto {
  @IsString()
  nickname!: string;
}

class NicknameDto {
  @IsString()
  @MinLength(2)
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

  @Post('agree-terms')
  @UseGuards(JwtAuthGuard)
  async agreeTerms(@CurrentUser() u: JwtPayload) {
    return this.auth.agreeToTerms(u.sub);
  }

  @Post('nickname')
  @UseGuards(JwtAuthGuard)
  async nickname(@CurrentUser() u: JwtPayload, @Body() dto: NicknameDto) {
    return this.auth.setNickname(u.sub, dto.nickname);
  }
}
