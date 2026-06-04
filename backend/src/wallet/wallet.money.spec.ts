import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { WalletService } from './wallet.service';
import { TxType, TxStatus } from '../common/enums';

/**
 * Тесты денежной логики кошелька на in-memory фейках Prisma/Redis.
 * Цель — зафиксировать корректность математики выплат, холда ставки,
 * возврата вывода и ИДЕМПОТЕНТНОСТИ (повторный расчёт не дублирует деньги).
 */

type Rec = Record<string, any>;

/** Применяет prisma-style data (increment/decrement/scalar) к записи. */
function applyData(rec: Rec, data: Rec) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && ('increment' in v || 'decrement' in v)) {
      const cur = Number(rec[k] ?? 0);
      rec[k] = 'increment' in v ? cur + Number(v.increment) : cur - Number(v.decrement);
    } else {
      rec[k] = v;
    }
  }
}

/** Проверяет запись по prisma-style where (eq / not / gt / contains / in). */
function matchWhere(rec: Rec, where: Rec): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const val = rec[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('not' in cond && val === cond.not) return false;
      if ('gt' in cond && !(val instanceof Date ? val.getTime() > cond.gt.getTime() : val > cond.gt)) return false;
      if ('in' in cond && !cond.in.includes(val)) return false;
      if ('contains' in cond && !(typeof val === 'string' && val.includes(cond.contains))) return false;
    } else if (val !== cond) {
      return false;
    }
  }
  return true;
}

class FakePrisma {
  users = new Map<string, Rec>();
  txns: Rec[] = [];
  matches = new Map<string, Rec>();
  withdrawals = new Map<string, Rec>();
  private seq = 0;
  private id(p: string) { return `${p}_${++this.seq}`; }

  user = {
    findUnique: async ({ where }: any) => {
      const r = this.users.get(where.id);
      return r ? { ...r } : null;
    },
    update: async ({ where, data }: any) => {
      const r = this.users.get(where.id);
      if (!r) throw new Error('user not found');
      applyData(r, data);
      return { ...r };
    },
  };

  transaction = {
    create: async ({ data }: any) => {
      const rec = { id: this.id('tx'), createdAt: new Date(), status: TxStatus.COMPLETED, ...data };
      this.txns.push(rec);
      return { ...rec };
    },
    createMany: async ({ data }: any) => {
      for (const d of data) this.txns.push({ id: this.id('tx'), createdAt: new Date(), status: TxStatus.COMPLETED, ...d });
      return { count: data.length };
    },
    findFirst: async ({ where }: any) => {
      const r = this.txns.find((t) => matchWhere(t, where));
      return r ? { ...r } : null;
    },
    findMany: async ({ where, orderBy, take }: any) => {
      let rows = this.txns.filter((t) => matchWhere(t, where));
      if (orderBy?.createdAt === 'desc') {
        rows = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
    update: async ({ where, data }: any) => {
      const r = this.txns.find((t) => t.id === where.id);
      if (r) applyData(r, data);
      return r ? { ...r } : null;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const t of this.txns) if (matchWhere(t, where)) { applyData(t, data); count++; }
      return { count };
    },
    aggregate: async ({ where }: any) => {
      const sum = this.txns.filter((t) => matchWhere(t, where)).reduce((s, t) => s + Number(t.amount ?? 0), 0);
      return { _sum: { amount: sum } };
    },
  };

  match = {
    findUnique: async ({ where }: any) => {
      const r = this.matches.get(where.id);
      return r ? { ...r } : null;
    },
    update: async ({ where, data }: any) => {
      const r = this.matches.get(where.id) ?? { id: where.id };
      applyData(r, data);
      this.matches.set(where.id, r);
      return { ...r };
    },
  };

  withdrawalRequest = {
    create: async ({ data }: any) => {
      const rec = { id: this.id('wr'), createdAt: new Date(), ...data };
      this.withdrawals.set(rec.id, rec);
      return { ...rec };
    },
    findUnique: async ({ where }: any) => {
      const r = this.withdrawals.get(where.id);
      return r ? { ...r } : null;
    },
    update: async ({ where, data }: any) => {
      const r = this.withdrawals.get(where.id);
      if (r) applyData(r, data);
      return r ? { ...r } : null;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const [id, r] of this.withdrawals) {
        if (matchWhere(r, where)) {
          applyData(r, data);
          this.withdrawals.set(id, r);
          count++;
        }
      }
      return { count };
    },
    aggregate: async ({ where }: any) => {
      const sum = [...this.withdrawals.values()].filter((w) => matchWhere(w, where)).reduce((s, w) => s + Number(w.amount ?? 0), 0);
      return { _sum: { amount: sum } };
    },
  };

  async $transaction(fn: (tx: any) => Promise<any>) {
    return fn(this);
  }

  // helpers
  seedUser(id: string, balance: number) {
    this.users.set(id, {
      id, balance, withdrawable: balance,
      wins: 0, losses: 0, draws: 0, totalWagered: 0, totalWon: 0,
    });
  }
}

const fakeRedis = { withLock: async (_k: string, _ttl: number, fn: () => any) => fn() };
const fakeBot = { notifyPayout: async () => {}, notify: async () => {} };
const fakeAudit = { log: () => {} };

function makeService(prisma: FakePrisma) {
  return new WalletService(prisma as any, fakeRedis as any, fakeBot as any, fakeAudit as any);
}

describe('WalletService money flows', () => {
  let prisma: FakePrisma;
  let wallet: WalletService;

  beforeEach(() => {
    prisma = new FakePrisma();
    wallet = makeService(prisma);
  });

  it('lockWagerForMatch debits both players and records WAGER_LOCK', async () => {
    prisma.seedUser('p1', 1000);
    prisma.seedUser('p2', 500);

    await wallet.lockWagerForMatch('m1', 'p1', 'p2', 300);

    assert.equal(Number(prisma.users.get('p1')!.balance), 700);
    assert.equal(Number(prisma.users.get('p2')!.balance), 200);
    assert.equal(Number(prisma.users.get('p1')!.totalWagered), 300);
    assert.equal(Number(prisma.users.get('p2')!.totalWagered), 300);
    const locks = prisma.txns.filter((t) => t.type === TxType.WAGER_LOCK);
    assert.equal(locks.length, 2);
  });

  it('lockWagerForMatch rejects when a player lacks balance (no debit)', async () => {
    prisma.seedUser('p1', 1000);
    prisma.seedUser('p2', 100);

    await assert.rejects(() => wallet.lockWagerForMatch('m1', 'p1', 'p2', 300));
    // Балансы не тронуты — проверка идёт до апдейтов.
    assert.equal(Number(prisma.users.get('p1')!.balance), 1000);
    assert.equal(Number(prisma.users.get('p2')!.balance), 100);
    assert.equal(prisma.txns.length, 0);
  });

  it('settleMatch pays winner pool minus rake and is idempotent', async () => {
    prisma.seedUser('p1', 700); // уже за вычетом ставки 300
    prisma.seedUser('p2', 200);

    const r1 = await wallet.settleMatch('m1', 'p1', 'p2', 300, 'p1', 5);
    // pool = 600, rake = 30, payout = 570
    assert.equal(r1.rake, 30);
    assert.equal(r1.winnerPayout, 570);
    assert.equal(Number(prisma.users.get('p1')!.balance), 700 + 570);
    assert.equal(Number(prisma.users.get('p1')!.wins), 1);
    assert.equal(Number(prisma.users.get('p2')!.losses), 1);
    assert.equal(prisma.matches.get('m1')!.status, 'FINISHED');

    const balAfter = Number(prisma.users.get('p1')!.balance);
    const r2 = await wallet.settleMatch('m1', 'p1', 'p2', 300, 'p1', 5);
    assert.equal((r2 as any).alreadySettled, true);
    // Повторный расчёт не платит снова.
    assert.equal(Number(prisma.users.get('p1')!.balance), balAfter);
    assert.equal(Number(prisma.users.get('p1')!.wins), 1);
  });

  it('settleMatch draw refunds both players the wager', async () => {
    prisma.seedUser('p1', 700);
    prisma.seedUser('p2', 200);

    const r = await wallet.settleMatch('m1', 'p1', 'p2', 300, null, 5);
    assert.equal(r.winnerPayout, 0);
    assert.equal(r.rake, 0);
    assert.equal(Number(prisma.users.get('p1')!.balance), 1000);
    assert.equal(Number(prisma.users.get('p2')!.balance), 500);
    assert.equal(Number(prisma.users.get('p1')!.draws), 1);
    assert.equal(Number(prisma.users.get('p2')!.draws), 1);
  });

  it('requestWithdrawal holds funds; reject refunds and is idempotent', async () => {
    prisma.seedUser('p1', 2000);
    const addr = '0x' + 'a'.repeat(40); // валидный ERC20

    const wr = await wallet.requestWithdrawal('p1', 1500, 'ERC20', addr);
    assert.equal(wr.status, 'PENDING');
    assert.equal(Number(prisma.users.get('p1')!.balance), 500);

    const rej1 = await wallet.resolveWithdrawal(wr.id, 'REJECTED', 'test');
    assert.equal(rej1.status, 'REJECTED');
    assert.equal(Number(prisma.users.get('p1')!.balance), 2000); // возврат

    // Повторное отклонение не возвращает деньги снова.
    await wallet.resolveWithdrawal(wr.id, 'REJECTED', 'test');
    assert.equal(Number(prisma.users.get('p1')!.balance), 2000);
  });

  it('completeDepositByInvoice credits once (idempotent)', async () => {
    prisma.seedUser('p1', 0);
    await wallet.createPendingDeposit('p1', 250, 'inv-123', 'cryptobot');

    const r1 = await wallet.completeDepositByInvoice('p1', 'inv-123');
    assert.equal(r1.credited, true);
    assert.equal(Number(prisma.users.get('p1')!.balance), 250);

    const r2 = await wallet.completeDepositByInvoice('p1', 'inv-123');
    assert.equal(r2.credited, false);
    assert.equal(Number(prisma.users.get('p1')!.balance), 250);
  });
});
