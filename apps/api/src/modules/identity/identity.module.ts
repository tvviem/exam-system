import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AuditLogsController } from './audit-logs/audit-logs.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthSessionStore } from './auth/auth-session-store';
import { LoginBlock } from './auth/login-block';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { InvitationAcceptanceService } from './invitations/invitation-acceptance.service';
import { InvitationRateLimiter } from './invitations/invitation-rate-limiter';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationsService } from './invitations/invitations.service';
import { PublicInvitationsController } from './invitations/public-invitations.controller';
import { LoginEventsController } from './login-events/login-events.controller';
import { LoginEventsService } from './login-events/login-events.service';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { AdminsController, UserManagementController } from './users/user-management.controller';
import { UserManagementService } from './users/user-management.service';
import { UsersRepository } from './users.repository';

@Module({
  imports: [AuditModule],
  controllers: [
    AuthController,
    UserManagementController,
    AdminsController,
    UnitsController,
    LoginEventsController,
    AuditLogsController,
    InvitationsController,
    PublicInvitationsController,
  ],
  providers: [
    AuthService,
    AuthSessionStore,
    LoginRateLimiter,
    LoginBlock,
    UsersRepository,
    AdminAccountsService,
    UserManagementService,
    UnitsService,
    LoginEventsService,
    InvitationsService,
    InvitationAcceptanceService,
    InvitationRateLimiter,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // CLI và các module khác chỉ dùng những gì được xuất ở đây.
  exports: [AuthSessionStore, AdminAccountsService],
})
export class IdentityModule {}
