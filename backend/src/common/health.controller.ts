import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    let db = false;
    let redis = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    try {
      redis = await this.redis.ping();
    } catch {
      redis = false;
    }
    const memOnly = !process.env.REDIS_URL?.trim();
    return {
      ok: db,
      db,
      redis: memOnly ? 'memory' : redis,
      ts: Date.now(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
