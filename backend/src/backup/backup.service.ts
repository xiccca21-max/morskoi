import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

/**
 * Автоматический бэкап SQLite-базы (где лежат реальные балансы игроков).
 * Раз в сутки копирует файл БД в подпапку backups/ рядом с базой,
 * хранит последние N копий. Перед копированием делает WAL-checkpoint,
 * чтобы снимок был консистентным.
 *
 * Включается только при DATABASE_URL вида file:/path/to.db (SQLite).
 * Кол-во хранимых копий — BACKUP_KEEP (по умолчанию 7).
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger('Backup');
  private readonly dbPath: string | null;
  private readonly keep = Math.max(1, Number(process.env.BACKUP_KEEP || 7));

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.DATABASE_URL || '';
    this.dbPath = url.startsWith('file:') ? url.slice('file:'.length) : null;
  }

  onModuleInit() {
    if (!this.dbPath) {
      this.logger.log('non-SQLite DATABASE_URL — backups disabled');
    } else {
      this.logger.log(`backups enabled for ${this.dbPath} (keep ${this.keep})`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async backup() {
    if (!this.dbPath) return;
    const dir = join(dirname(this.dbPath), 'backups');
    try {
      // Сбрасываем WAL в основной файл, чтобы копия была полной.
      await this.prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => undefined);
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const dest = join(dir, `naval-${stamp}.db`);
      await fs.copyFile(this.dbPath, dest);
      this.logger.log(`backup created: ${dest}`);
      await this.prune(dir);
    } catch (e: any) {
      this.logger.warn(`backup failed: ${e?.message || e}`);
    }
  }

  private async prune(dir: string) {
    try {
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith('naval-') && f.endsWith('.db'))
        .sort(); // имена с ISO-меткой сортируются хронологически
      const excess = files.length - this.keep;
      for (let i = 0; i < excess; i++) {
        await fs.unlink(join(dir, files[i])).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }
}
