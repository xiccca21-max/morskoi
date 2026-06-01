import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Кратковременное «онлайн»-состояние (WebSocket / вход в приложение). */
@Injectable()
export class PresenceService {
  private readonly ttlSec = Number(process.env.PRESENCE_TTL_SEC ?? 120);
  private readonly setKey = 'presence:online';

  constructor(private readonly redis: RedisService) {}

  async touch(userId: string, meta?: { username?: string; source?: string }) {
    const payload = JSON.stringify({ at: Date.now(), ...meta });
    await this.redis.client.set(`presence:${userId}`, payload, 'EX', this.ttlSec);
    await this.redis.client.sadd(this.setKey, userId);
  }

  async clear(userId: string) {
    await this.redis.client.del(`presence:${userId}`);
    await this.redis.client.srem(this.setKey, userId);
  }

  async listOnlineUserIds(): Promise<string[]> {
    const ids: string[] = await this.redis.client.smembers(this.setKey);
    const alive: string[] = [];
    for (const id of ids) {
      const v = await this.redis.client.get(`presence:${id}`);
      if (v) alive.push(id);
      else await this.redis.client.srem(this.setKey, id);
    }
    return alive;
  }
}
