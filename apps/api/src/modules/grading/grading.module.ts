import { Module } from '@nestjs/common';
import { AutogradeService } from './autograde.service';
import { GradingJobs } from './grading.jobs';
import { GradingHooksService } from './grading-hooks.service';

// Cổng GRADING_SOURCE (attempt) và EXAM_CONTENT (exam) do `AttemptPortsWiringModule` cung cấp.
@Module({
  providers: [AutogradeService, GradingJobs, GradingHooksService],
  exports: [AutogradeService, GradingHooksService],
})
export class GradingModule {}
