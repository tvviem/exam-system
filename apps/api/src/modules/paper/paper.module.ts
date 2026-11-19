import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PaperController } from './paper.controller';
import { PaperService } from './paper.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục. Các cổng EXAM_CONTENT, SESSION_INFO, EXAMINER_DIRECTORY,
// ILLUSTRATION_FILES do các module cài đặt, nối ở `AttemptPortsWiringModule` và `PaperPortsWiringModule`.
@Module({
  imports: [AuditModule],
  controllers: [PaperController],
  providers: [PaperService],
})
export class PaperModule {}
