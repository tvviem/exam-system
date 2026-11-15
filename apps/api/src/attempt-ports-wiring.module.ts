import { Global, Module } from '@nestjs/common';
import { ADMIN_DIRECTORY } from './common/admin-directory';
import { ATTEMPT_GRADE_GUARD, ATTEMPT_SUBMITTED_HOOKS } from './common/attempt-grading';
import { CANDIDATE_MEDIA } from './common/candidate-media';
import { EXAM_CONTENT } from './common/exam-content';
import { EXAMINER_DIRECTORY } from './common/examiner-directory';
import { GRADING_SESSIONS } from './common/grading-sessions';
import { GRADING_SOURCE } from './common/grading-source';
import { SESSION_GRADING_STATUS } from './common/grading-status';
import { SESSION_ATTEMPTS } from './common/session-attempts';
import { SESSION_ENTRY } from './common/session-entry';
import { SUPPORT_ROSTER_SCOPE } from './common/support-roster-scope';
import { USER_DEACTIVATION_HOOKS } from './common/user-deactivation';
import { VIOLATION_PENALTIES } from './common/violation-penalties';
import { AttemptModule } from './modules/attempt/attempt.module';
import { CandidateMediaService } from './modules/attempt/candidate-media.service';
import { GradingSourceService } from './modules/attempt/grading-source.service';
import { SessionAttemptsService } from './modules/attempt/session-attempts.service';
import { ViolationPenaltiesService } from './modules/attempt/violation-penalties.service';
import { ExamModule } from './modules/exam/exam.module';
import { ExamContentService } from './modules/exam/exam-content.service';
import { GradingModule } from './modules/grading/grading.module';
import { GradingHooksService } from './modules/grading/grading-hooks.service';
import { GradingStatusService } from './modules/grading/grading-status.service';
import { AdminDirectoryService } from './modules/identity/admin-directory.service';
import { ExaminerDirectoryService } from './modules/identity/examiner-directory.service';
import { IdentityModule } from './modules/identity/identity.module';
import { GradingSessionsService } from './modules/session/grading-sessions.service';
import { SessionModule } from './modules/session/session.module';
import { SessionEntryService } from './modules/session/session-entry.service';
import { SessionRosterScopeService } from './modules/session/session-roster-scope.service';

/** Nối các cổng giữa `session`, `attempt` và `exam` (Q228): các module cài đặt và đòi cổng không import nhau. */
@Global()
@Module({
  imports: [AttemptModule, SessionModule, ExamModule, GradingModule, IdentityModule],
  providers: [
    { provide: SESSION_ENTRY, useExisting: SessionEntryService },
    { provide: EXAM_CONTENT, useExisting: ExamContentService },
    { provide: SESSION_ATTEMPTS, useExisting: SessionAttemptsService },
    { provide: USER_DEACTIVATION_HOOKS, useExisting: SessionAttemptsService },
    { provide: CANDIDATE_MEDIA, useExisting: CandidateMediaService },
    { provide: GRADING_SOURCE, useExisting: GradingSourceService },
    { provide: ATTEMPT_SUBMITTED_HOOKS, useExisting: GradingHooksService },
    { provide: ATTEMPT_GRADE_GUARD, useExisting: GradingHooksService },
    { provide: GRADING_SESSIONS, useExisting: GradingSessionsService },
    { provide: SESSION_GRADING_STATUS, useExisting: GradingStatusService },
    { provide: EXAMINER_DIRECTORY, useExisting: ExaminerDirectoryService },
    { provide: ADMIN_DIRECTORY, useExisting: AdminDirectoryService },
    { provide: VIOLATION_PENALTIES, useExisting: ViolationPenaltiesService },
    { provide: SUPPORT_ROSTER_SCOPE, useExisting: SessionRosterScopeService },
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
    GRADING_SESSIONS,
    SESSION_GRADING_STATUS,
    EXAMINER_DIRECTORY,
    ADMIN_DIRECTORY,
    VIOLATION_PENALTIES,
    SUPPORT_ROSTER_SCOPE,
  ],
})
export class AttemptPortsWiringModule {}
