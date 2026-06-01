import { Injectable } from '@nestjs/common';
import { AdminAlertService } from './admin-alert.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AdminAlertService,
  ) {}

  log(userId: string | null | undefined, action: string, meta?: Record<string, unknown>) {
    this.alerts.notifyAction(userId, action, meta);
    return (this.prisma as any).actionLog
      .create({
        data: {
          userId: userId ?? null,
          action,
          meta: meta ? JSON.stringify(meta) : null,
        },
      })
      .catch(() => undefined);
  }
}
