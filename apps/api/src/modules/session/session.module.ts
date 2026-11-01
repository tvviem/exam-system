import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionLifecycleService } from './session-lifecycle.service';
import { SessionRosterController } from './session-roster.controller';
import { SessionRosterService } from './session-roster.service';
import { SessionUsageService } from './session-usage.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  imports: [IdentityModule, NotificationsModule],
  controllers: [SessionsController, SessionRosterController],
  providers: [SessionsService, SessionLifecycleService, SessionRosterService, SessionUsageService],
  exports: [SessionUsageService],
})
export class SessionModule {}
