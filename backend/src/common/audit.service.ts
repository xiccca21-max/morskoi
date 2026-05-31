import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(userId: string | null | undefined, action: string, meta?: Record<string, unknown>) {
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
