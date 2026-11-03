import { Module } from '@nestjs/common';
import { AttemptSweepJob } from './attempt-sweep.job';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { CandidateMediaService } from './candidate-media.service';
import { JoinRateLimiter } from './join-rate-limiter';
import { SessionAttemptsService } from './session-attempts.service';
import { SessionPreviewController } from './session-preview.controller';
import { SessionPreviewService } from './session-preview.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục. Cổng SESSION_ENTRY và EXAM_CONTENT do
// `AttemptPortsWiringModule` cung cấp.
@Module({
  controllers: [AttemptsController, SessionPreviewController],
  providers: [
    AttemptsService,
    JoinRateLimiter,
    SessionAttemptsService,
    AttemptSweepJob,
    CandidateMediaService,
    SessionPreviewService,
  ],
  exports: [SessionAttemptsService, CandidateMediaService],
})
export class AttemptModule {}
