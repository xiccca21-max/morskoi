import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminAlertService } from '../common/admin-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

/**
 * Автоматический бэкап SQLite-базы (где лежат реальные балансы игроков).
 * Раз в сутки копирует файл БД в подпапку backups/ рядом с базой,
 * хранит последние N копий. Уведомляет админа в Telegram (ADMIN_TELEGRAM_ID).
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger('Backup');
  private readonly dbPath: string | null;
  private readonly keep = Math.max(1, Number(process.env.BACKUP_KEEP || 7));
  private readonly adminTgId = process.env.ADMIN_TELEGRAM_ID || '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotService,
    private readonly adminAlerts: AdminAlertService,
  ) {
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
      await this.prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => undefined);
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const dest = join(dir, `naval-${stamp}.db`);
      await fs.copyFile(this.dbPath, dest);
      const stat = await fs.stat(dest);
      const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
      this.logger.log(`backup created: ${dest} (${sizeMb} MB)`);
      await this.prune(dir);
      await this.adminAlerts.send(
        `✅ <b>Бэкап БД создан</b>\n` +
          `Файл: <code>${dest.split(/[/\\]/).pop()}</code>\n` +
          `Размер: ${sizeMb} MB\n` +
          `Хранится копий: ${this.keep}`,
      );
      if (this.adminTgId && stat.size < 48 * 1024 * 1024) {
        await this.bot.sendDocument(
          this.adminTgId,
          dest,
          `📦 Ежедневный бэкап БД (${sizeMb} MB)`,
        );
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      this.logger.warn(`backup failed: ${msg}`);
      await this.adminAlerts.send(`❌ <b>Бэкап БД не удался</b>\n${msg}`);
    }
  }

  private async prune(dir: string) {
    try {
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith('naval-') && f.endsWith('.db'))
        .sort();
      const excess = files.length - this.keep;
      for (let i = 0; i < excess; i++) {
        await fs.unlink(join(dir, files[i])).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }
}
