import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutogradeService } from './autograde.service';
import { DelegationService } from './delegation.service';
import { GradingController } from './grading.controller';
import { GradingJobs } from './grading.jobs';
import { GradingAccessService } from './grading-access.service';
import { GradingContextService } from './grading-context.service';
import { AdminDelegateController, OwnerDelegateController } from './grading-delegate.controller';
import { GradingHooksService } from './grading-hooks.service';
import { ManualGradingService } from './manual-grading.service';
import { PenaltiesService } from './penalties.service';
import { ResultsService } from './results.service';

// Cổng GRADING_SOURCE, GRADING_SESSIONS, EXAM_CONTENT, CANDIDATE_DIRECTORY, EXAMINER_DIRECTORY, VIOLATION_PENALTIES do các
// module `*PortsWiringModule` cung cấp. Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  imports: [AuditModule, NotificationsModule, IdentityModule],
  controllers: [GradingController, OwnerDelegateController, AdminDelegateController],
  providers: [
    AutogradeService,
    GradingJobs,
    GradingHooksService,
    GradingAccessService,
    GradingContextService,
    ManualGradingService,
    ResultsService,
    PenaltiesService,
    DelegationService,
  ],
  exports: [AutogradeService, GradingHooksService],
})
export class GradingModule {}
