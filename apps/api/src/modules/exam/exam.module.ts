import { Module } from '@nestjs/common';
import { ExamUsageService } from './exam-usage.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  controllers: [ExamsController],
  providers: [ExamsService, ExamUsageService],
  exports: [ExamUsageService],
})
export class ExamModule {}
