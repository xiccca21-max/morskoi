import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { CosmeticsService } from './cosmetics.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import type { CosmeticType } from './cosmetics.catalog';

class EquipDto {
  @IsIn(['title', 'frame', 'skin'])
  type!: CosmeticType;

  @IsString()
  id!: string;
}

@Controller('cosmetics')
@UseGuards(JwtAuthGuard)
export class CosmeticsController {
  constructor(private readonly cosmetics: CosmeticsService) {}

  @Get()
  profile(@CurrentUser() u: JwtPayload) {
    return this.cosmetics.getProfile(u.sub);
  }

  @Post('equip')
  equip(@CurrentUser() u: JwtPayload, @Body() dto: EquipDto) {
    return this.cosmetics.equip(u.sub, dto.type, dto.id);
  }
}
