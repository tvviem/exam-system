import { Global, Module } from '@nestjs/common';
import { ATTEMPT_GRADE_GUARD, ATTEMPT_SUBMITTED_HOOKS } from './common/attempt-grading';
import { CANDIDATE_MEDIA } from './common/candidate-media';
import { EXAM_CONTENT } from './common/exam-content';
import { GRADING_SOURCE } from './common/grading-source';
import { SESSION_ATTEMPTS } from './common/session-attempts';
import { SESSION_ENTRY } from './common/session-entry';
import { USER_DEACTIVATION_HOOKS } from './common/user-deactivation';
import { AttemptModule } from './modules/attempt/attempt.module';
import { CandidateMediaService } from './modules/attempt/candidate-media.service';
import { GradingSourceService } from './modules/attempt/grading-source.service';
import { SessionAttemptsService } from './modules/attempt/session-attempts.service';
import { ExamModule } from './modules/exam/exam.module';
import { ExamContentService } from './modules/exam/exam-content.service';
import { GradingModule } from './modules/grading/grading.module';
import { GradingHooksService } from './modules/grading/grading-hooks.service';
import { SessionModule } from './modules/session/session.module';
import { SessionEntryService } from './modules/session/session-entry.service';

/** Nối các cổng giữa `session`, `attempt` và `exam` (Q228): các module cài đặt và đòi cổng không import nhau. */
@Global()
@Module({
  imports: [AttemptModule, SessionModule, ExamModule, GradingModule],
  providers: [
    { provide: SESSION_ENTRY, useExisting: SessionEntryService },
    { provide: EXAM_CONTENT, useExisting: ExamContentService },
    { provide: SESSION_ATTEMPTS, useExisting: SessionAttemptsService },
    { provide: USER_DEACTIVATION_HOOKS, useExisting: SessionAttemptsService },
    { provide: CANDIDATE_MEDIA, useExisting: CandidateMediaService },
    { provide: GRADING_SOURCE, useExisting: GradingSourceService },
    { provide: ATTEMPT_SUBMITTED_HOOKS, useExisting: GradingHooksService },
    { provide: ATTEMPT_GRADE_GUARD, useExisting: GradingHooksService },
  ],
  exports: [
    SESSION_ENTRY,
    EXAM_CONTENT,
    SESSION_ATTEMPTS,
    USER_DEACTIVATION_HOOKS,
    CANDIDATE_MEDIA,
    GRADING_SOURCE,
    ATTEMPT_SUBMITTED_HOOKS,
    ATTEMPT_GRADE_GUARD,
  ],
})
export class AttemptPortsWiringModule {}
