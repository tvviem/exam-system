import { Global, Injectable, Module } from '@nestjs/common';
import { REALTIME_ACCESS, type RealtimeAccess } from './common/realtime-access';
import { AttemptModule } from './modules/attempt/attempt.module';
import { SessionAttemptsService } from './modules/attempt/session-attempts.service';
import { SessionModule } from './modules/session/session.module';
import { SessionMonitorService } from './modules/session/session-monitor.service';

/** Trả lời "ai được vào phòng nào" bằng cách hỏi `session` và `attempt`, nên `realtime` không đọc bảng của hai module đó. */
@Injectable()
class RealtimeAccessService implements RealtimeAccess {
  constructor(
    private readonly sessions: SessionMonitorService,
    private readonly attempts: SessionAttemptsService,
  ) {}

  canMonitor(userId: string, sessionId: string) {
    return this.sessions.ownsSession(userId, sessionId);
  }

  canFollow(userId: string, attemptId: string, deviceKey: string | undefined) {
    return this.attempts.canFollow(userId, attemptId, deviceKey);
  }
}

@Global()
@Module({
  imports: [SessionModule, AttemptModule],
  providers: [{ provide: REALTIME_ACCESS, useClass: RealtimeAccessService }],
  exports: [REALTIME_ACCESS],
})
export class RealtimeWiringModule {}
