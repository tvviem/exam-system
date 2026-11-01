import { Global, Module } from '@nestjs/common';
import { EXAM_USAGE } from './common/exam-usage';
import { ExamModule } from './modules/exam/exam.module';
import { ExamUsageService } from './modules/exam/exam-usage.service';

/** Nối cổng `EXAM_USAGE` (Q166): `question-bank` đòi cổng, `exam` cài đặt, hai module không import nhau. */
@Global()
@Module({
  imports: [ExamModule],
  providers: [{ provide: EXAM_USAGE, useExisting: ExamUsageService }],
  exports: [EXAM_USAGE],
})
export class ExamUsageWiringModule {}
