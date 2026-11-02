import { Global, Module } from '@nestjs/common';
import { EXAM_CONTENT } from './common/exam-content';
import { SESSION_ATTEMPTS } from './common/session-attempts';
import { SESSION_ENTRY } from './common/session-entry';
import { AttemptModule } from './modules/attempt/attempt.module';
import { SessionAttemptsService } from './modules/attempt/session-attempts.service';
import { ExamModule } from './modules/exam/exam.module';
import { ExamContentService } from './modules/exam/exam-content.service';
import { SessionModule } from './modules/session/session.module';
import { SessionEntryService } from './modules/session/session-entry.service';

/** Nối các cổng giữa `session`, `attempt` và `exam` (Q228): các module cài đặt và đòi cổng không import nhau. */
@Global()
@Module({
  imports: [AttemptModule, SessionModule, ExamModule],
  providers: [
    { provide: SESSION_ENTRY, useExisting: SessionEntryService },
    { provide: EXAM_CONTENT, useExisting: ExamContentService },
    { provide: SESSION_ATTEMPTS, useExisting: SessionAttemptsService },
  ],
  exports: [SESSION_ENTRY, EXAM_CONTENT, SESSION_ATTEMPTS],
})
export class AttemptPortsWiringModule {}
