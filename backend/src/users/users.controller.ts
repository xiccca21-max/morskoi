import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

class LimitsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyDepositLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selfExcludeDays?: number;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() u: JwtPayload) {
    return this.users.getMe(u.sub);
  }

  @Patch('me/limits')
  setLimits(@CurrentUser() u: JwtPayload, @Body() dto: LimitsDto) {
    return this.users.setLimits(u.sub, dto.dailyDepositLimit, dto.selfExcludeDays);
  }

  @Delete('me')
  deleteMe(@CurrentUser() u: JwtPayload) {
    return this.users.deleteAccount(u.sub);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.users.getById(id);
  }
}
