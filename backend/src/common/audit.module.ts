import { Global, Module } from '@nestjs/common';
import { AdminAlertService } from './admin-alert.service';
import { AuditService } from './audit.service';
import { PresenceService } from './presence.service';

@Global()
@Module({
  providers: [AuditService, AdminAlertService, PresenceService],
  exports: [AuditService, AdminAlertService, PresenceService],
})
export class AuditModule {}
