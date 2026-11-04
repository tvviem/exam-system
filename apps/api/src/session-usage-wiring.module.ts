import { Global, Module } from '@nestjs/common';
import { LIVE_SESSION_GUARD } from './common/live-session-guard';
import { SESSION_USAGE } from './common/session-usage';
import { SessionModule } from './modules/session/session.module';
import { SessionLiveGuardService } from './modules/session/session-live-guard.service';
import { SessionUsageService } from './modules/session/session-usage.service';

/**
 * Nối các cổng mà `session` cài đặt cho module khác (các module không import nhau): `SESSION_USAGE` cho `exam` (Q204) và
 * `LIVE_SESSION_GUARD` cho `identity` (Q264).
 */
@Global()
@Module({
  imports: [SessionModule],
  providers: [
    { provide: SESSION_USAGE, useExisting: SessionUsageService },
    { provide: LIVE_SESSION_GUARD, useExisting: SessionLiveGuardService },
  ],
  exports: [SESSION_USAGE, LIVE_SESSION_GUARD],
})
export class SessionUsageWiringModule {}
