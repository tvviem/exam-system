import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GradingSessionsService } from './grading-sessions.service';
import { SessionEntryService } from './session-entry.service';
import { SessionLifecycleService } from './session-lifecycle.service';
import { SessionLiveGuardService } from './session-live-guard.service';
import { SessionMonitorController } from './session-monitor.controller';
import { SessionMonitorService } from './session-monitor.service';
import { SessionOwnedContent } from './session-owned-content';
import { SessionRosterController } from './session-roster.controller';
import { SessionRosterService } from './session-roster.service';
import { SessionUsageService } from './session-usage.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  imports: [IdentityModule, NotificationsModule, AuditModule],
  controllers: [SessionsController, SessionRosterController, SessionMonitorController],
  providers: [
    SessionsService,
    SessionLifecycleService,
    SessionMonitorService,
    SessionRosterService,
    SessionUsageService,
    SessionEntryService,
    SessionOwnedContent,
    SessionLiveGuardService,
    GradingSessionsService,
  ],
  exports: [
    SessionUsageService,
    SessionEntryService,
    SessionMonitorService,
    SessionOwnedContent,
    SessionLiveGuardService,
    GradingSessionsService,
  ],
})
export class SessionModule {}
