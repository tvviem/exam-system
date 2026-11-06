import { Module } from '@nestjs/common';
import { AttemptPresence } from './attempt-presence';
import { AttemptSweepJob } from './attempt-sweep.job';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { CandidateMediaService } from './candidate-media.service';
import { GradingSourceService } from './grading-source.service';
import { JoinRateLimiter } from './join-rate-limiter';
import { RequestRateLimiter } from './request-rate-limiter';
import { SessionAttemptsService } from './session-attempts.service';
import { SessionPreviewController } from './session-preview.controller';
import { SessionPreviewService } from './session-preview.service';
import { ViolationPenaltiesService } from './violation-penalties.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục. Cổng SESSION_ENTRY và EXAM_CONTENT do
// `AttemptPortsWiringModule` cung cấp.
@Module({
  controllers: [AttemptsController, SessionPreviewController],
  providers: [
    AttemptsService,
    JoinRateLimiter,
    RequestRateLimiter,
    AttemptPresence,
    SessionAttemptsService,
    AttemptSweepJob,
    CandidateMediaService,
    SessionPreviewService,
    GradingSourceService,
    ViolationPenaltiesService,
  ],
  exports: [
    SessionAttemptsService,
    CandidateMediaService,
    GradingSourceService,
    ViolationPenaltiesService,
  ],
})
export class AttemptModule {}
