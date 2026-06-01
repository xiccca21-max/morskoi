import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PresenceService } from './presence.service';

@Global()
@Module({
  providers: [AuditService, PresenceService],
  exports: [AuditService, PresenceService],
})
export class AuditModule {}
