import { Module } from '@nestjs/common';
import { AttemptSweepJob } from './attempt-sweep.job';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { JoinRateLimiter } from './join-rate-limiter';
import { SessionAttemptsService } from './session-attempts.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục. Cổng SESSION_ENTRY và EXAM_CONTENT do
// `AttemptPortsWiringModule` cung cấp.
@Module({
  controllers: [AttemptsController],
  providers: [AttemptsService, JoinRateLimiter, SessionAttemptsService, AttemptSweepJob],
  exports: [SessionAttemptsService],
})
export class AttemptModule {}
