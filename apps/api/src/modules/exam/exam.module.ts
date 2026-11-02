import { Module } from '@nestjs/common';
import { ExamCatalogService } from './exam-catalog.service';
import { ExamLifecycleService } from './exam-lifecycle.service';
import { ExamOwnedContent } from './exam-owned-content';
import { ExamUsageService } from './exam-usage.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  controllers: [ExamsController],
  providers: [
    ExamsService,
    ExamLifecycleService,
    ExamUsageService,
    ExamOwnedContent,
    ExamCatalogService,
  ],
  exports: [ExamUsageService, ExamOwnedContent, ExamCatalogService],
})
export class ExamModule {}
