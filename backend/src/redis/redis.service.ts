import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/**
 * In-memory реализация — заменяет настоящий Redis для локального запуска
 * без облаков. Поддерживает только используемые проектом операции
 * (lock, set NX EX, sadd, smembers, expire, del, eval-style script для
 * snippet'а распределённого lock’а из исходной реализации).
 *
 * Этого достаточно для локальной разработки и тестового PvP.
 * В проде используйте обычный Redis (см. редактируемые комментарии).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis(InMemory)');

  // key -> { value, expiresAt }
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  // key -> Set<member> (для sadd/smembers)
  private sets = new Map<string, Set<string>>();
  private setTtl = new Map<string, number>();

  // Совместимость с прежним кодом: `redis.client.<method>`
  public client: any;

  async onModuleInit() {
    this.logger.log('Using in-memory Redis-compatible store');
    this.client = {
      // SET key value EX seconds NX
      set: (...args: any[]) => this.setCmd(args),
      get: (key: string) => Promise.resolve(this.getCmd(key)),
      del: (...keys: string[]) => Promise.resolve(this.delCmd(keys)),
      eval: (_script: string, _numKeys: number, key: string, _token: string) =>
        Promise.resolve(this.delCmd([key])),
      sadd: (key: string, ...members: string[]) => Promise.resolve(this.saddCmd(key, members)),
      smembers: (key: string) => Promise.resolve(this.smembersCmd(key)),
      expire: (key: string, seconds: number) => Promise.resolve(this.expireCmd(key, seconds)),
    };
    setInterval(() => this.cleanup(), 5000).unref();
  }

  async onModuleDestroy() {
    this.store.clear();
    this.sets.clear();
    this.setTtl.clear();
  }

  // ===== низкоуровневые операции =====

  private cleanup() {
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

  private isExpired(k: string): boolean {
    const v = this.store.get(k);
    if (!v) return true;
    if (v.expiresAt !== null && v.expiresAt < Date.now()) {
      this.store.delete(k);
      return true;
    }
    return false;
  }

  private getCmd(key: string): string | null {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  private delCmd(keys: string[]): number {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n++;
      if (this.sets.delete(k)) n++;
      this.setTtl.delete(k);
    }
    return n;
  }

  /**
   * Поддерживает варианты:
   *   set(key, value)
   *   set(key, value, 'EX', seconds)
   *   set(key, value, 'PX', ms)
   *   + любой флаг 'NX' (атомарное создание, если ключа нет)
   */
  private setCmd(args: any[]): Promise<'OK' | null> {
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
    if (nx) {
      if (!this.isExpired(key)) return Promise.resolve(null);
    }
    this.store.set(key, { value: String(value), expiresAt });
    return Promise.resolve('OK');
  }

  private saddCmd(key: string, members: string[]): number {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const s = this.sets.get(key)!;
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) { s.add(m); added++; }
    }
    return added;
  }

  private smembersCmd(key: string): string[] {
    const exp = this.setTtl.get(key);
    if (exp && exp < Date.now()) {
      this.sets.delete(key);
      this.setTtl.delete(key);
      return [];
    }
    return Array.from(this.sets.get(key) ?? []);
  }

  private expireCmd(key: string, seconds: number): number {
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

  // ===== высокоуровневые helpers (как в оригинале) =====

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const lockKey = `lock:${key}`;
    const start = Date.now();
    // ждём максимум ttlMs * 2 + 500 мс
    const maxWait = ttlMs * 2 + 500;
    while (true) {
      const ok = await this.setCmd([lockKey, '1', 'PX', ttlMs, 'NX']);
      if (ok === 'OK') break;
      if (Date.now() - start > maxWait) throw new Error(`Resource ${key} is locked`);
      await new Promise((r) => setTimeout(r, 30));
    }
    try {
      return await fn();
    } finally {
      this.delCmd([lockKey]);
    }
  }

  async consumeNonce(userId: string, nonce: string, ttlSec = 60): Promise<boolean> {
    const k = `nonce:${userId}:${nonce}`;
    const res = await this.setCmd([k, '1', 'EX', ttlSec, 'NX']);
    return res === 'OK';
  }
}
