import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Endpoint đọc nhật ký nằm ở module identity (audit-logs.controller) vì cần gắn tên người thực hiện.
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
