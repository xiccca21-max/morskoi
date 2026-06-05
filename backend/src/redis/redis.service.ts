import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis-совместимый слой: ioredis при REDIS_URL, иначе in-memory для локальной разработки.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private ioredis?: Redis;
  private useMemory = true;

  private store = new Map<string, { value: string; expiresAt: number | null }>();
  private sets = new Map<string, Set<string>>();
  private setTtl = new Map<string, number>();
  private cleanupTimer?: NodeJS.Timeout;

  public client: any;

  async onModuleInit() {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      try {
        this.useMemory = false;
        this.ioredis = new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          connectTimeout: 5000,
        });
        await this.ioredis.connect();
        const safe = url.replace(/:([^:@/]+)@/, ':***@');
        this.logger.log(`Connected → ${safe}`);
        this.client = this.buildRedisClient();
        return;
      } catch (e: any) {
        this.logger.warn(`Redis unavailable (${e?.message}), falling back to in-memory`);
        await this.ioredis?.quit().catch(() => undefined);
        this.ioredis = undefined;
        this.useMemory = true;
      }
    }

    this.initMemoryClient();
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL обязателен в production (in-memory locks не координируют инстансы)');
    }
  }

  private buildRedisClient() {
    return {
      set: (key: string, value: string, ...args: any[]) =>
        (this.ioredis!.set as (...a: any[]) => Promise<'OK' | null>)(key, value, ...args),
      get: (key: string) => this.ioredis!.get(key),
      del: (...keys: string[]) => this.ioredis!.del(...keys),
      eval: (script: string, n: number, ...args: any[]) => this.ioredis!.eval(script, n, ...args),
      sadd: (key: string, ...members: string[]) => this.ioredis!.sadd(key, ...members),
      srem: (key: string, ...members: string[]) => this.ioredis!.srem(key, ...members),
      smembers: (key: string) => this.ioredis!.smembers(key),
      expire: (key: string, seconds: number) => this.ioredis!.expire(key, seconds),
      ping: () => this.ioredis!.ping(),
    };
  }

  private initMemoryClient() {
    this.logger.log('Using in-memory store');
    this.client = {
      set: (...args: any[]) => this.memSet(args),
      get: (key: string) => Promise.resolve(this.memGet(key)),
      del: (...keys: string[]) => Promise.resolve(this.memDel(keys)),
      eval: (_script: string, _numKeys: number, key: string) => Promise.resolve(this.memDel([key])),
      sadd: (key: string, ...members: string[]) => Promise.resolve(this.memSadd(key, members)),
      srem: (key: string, ...members: string[]) => Promise.resolve(this.memSrem(key, members)),
      smembers: (key: string) => Promise.resolve(this.memSmembers(key)),
      expire: (key: string, seconds: number) => Promise.resolve(this.memExpire(key, seconds)),
      ping: () => Promise.resolve('PONG'),
    };
    this.cleanupTimer = setInterval(() => this.memCleanup(), 5000);
    this.cleanupTimer.unref();
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.ioredis?.quit().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.client.ping();
      return r === 'PONG';
    } catch {
      return false;
    }
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const lockKey = `lock:${key}`;
    const start = Date.now();
    const maxWait = ttlMs * 2 + 500;
    while (true) {
      const ok = this.useMemory
        ? await this.memSet([lockKey, '1', 'PX', ttlMs, 'NX'])
        : await this.ioredis!.set(lockKey, '1', 'PX', ttlMs, 'NX');
      if (ok === 'OK') break;
      if (Date.now() - start > maxWait) throw new Error(`Resource ${key} is locked`);
      await new Promise((r) => setTimeout(r, 30));
    }
    try {
      return await fn();
    } finally {
      if (this.useMemory) this.memDel([lockKey]);
      else await this.ioredis!.del(lockKey);
    }
  }

  async consumeNonce(userId: string, nonce: string, ttlSec = 60): Promise<boolean> {
    const k = `nonce:${userId}:${nonce}`;
    const ok = this.useMemory
      ? await this.memSet([k, '1', 'EX', ttlSec, 'NX'])
      : await this.ioredis!.set(k, '1', 'EX', ttlSec, 'NX');
    return ok === 'OK';
  }

  /** Одноразовый initData (защита от replay в окне auth_date). */
  async consumeInitDataHash(hash: string, ttlSec: number): Promise<boolean> {
    const k = `initdata:hash:${hash}`;
    const ok = this.useMemory
      ? await this.memSet([k, '1', 'EX', ttlSec, 'NX'])
      : await this.ioredis!.set(k, '1', 'EX', ttlSec, 'NX');
    return ok === 'OK';
  }

  // ===== in-memory =====

  private memCleanup() {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expiresAt !== null && v.expiresAt < now) this.store.delete(k);
    }
    for (const [k, exp] of this.setTtl) {
      if (exp < now) {
        this.sets.delete(k);
        this.setTtl.delete(k);
      }
    }
  }

  private memExpired(k: string): boolean {
    const v = this.store.get(k);
    if (!v) return true;
    if (v.expiresAt !== null && v.expiresAt < Date.now()) {
      this.store.delete(k);
      return true;
    }
    return false;
  }

  private memGet(key: string): string | null {
    if (this.memExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  private memDel(keys: string[]): number {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n++;
      if (this.sets.delete(k)) n++;
      this.setTtl.delete(k);
    }
    return n;
  }

  private memSet(args: any[]): Promise<'OK' | null> {
    const [key, value, ...rest] = args;
    let expiresAt: number | null = null;
    let nx = false;
    for (let i = 0; i < rest.length; i++) {
      const a = String(rest[i]).toUpperCase();
      if (a === 'EX') {
        expiresAt = Date.now() + Number(rest[i + 1]) * 1000;
        i++;
      } else if (a === 'PX') {
        expiresAt = Date.now() + Number(rest[i + 1]);
        i++;
      } else if (a === 'NX') {
        nx = true;
      }
    }
    if (nx && !this.memExpired(key)) return Promise.resolve(null);
    this.store.set(key, { value: String(value), expiresAt });
    return Promise.resolve('OK');
  }

  private memSadd(key: string, members: string[]): number {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const s = this.sets.get(key)!;
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) { s.add(m); added++; }
    }
    return added;
  }

  private memSrem(key: string, members: string[]): number {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) {
      if (s.delete(m)) removed++;
    }
    if (s.size === 0) {
      this.sets.delete(key);
      this.setTtl.delete(key);
    }
    return removed;
  }

  private memSmembers(key: string): string[] {
    const exp = this.setTtl.get(key);
    if (exp && exp < Date.now()) {
      this.sets.delete(key);
      this.setTtl.delete(key);
      return [];
    }
    return Array.from(this.sets.get(key) ?? []);
  }

  private memExpire(key: string, seconds: number): number {
    if (this.store.has(key)) {
      const v = this.store.get(key)!;
      v.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }
    if (this.sets.has(key)) {
      this.setTtl.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }
}
