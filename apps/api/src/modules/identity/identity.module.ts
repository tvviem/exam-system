import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { AccountRequestApproveJob } from './account-requests/account-request-approve.job';
import { AccountRequestParseJob } from './account-requests/account-request-parse.job';
import { AccountRequestsController } from './account-requests/account-requests.controller';
import { AccountRequestsService } from './account-requests/account-requests.service';
import { RequesterCredentialsService } from './account-requests/requester-credentials.service';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminDirectoryService } from './admin-directory.service';
import { AuditLogsController } from './audit-logs/audit-logs.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthSessionStore } from './auth/auth-session-store';
import { LoginBlock } from './auth/login-block';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { TokenAuthenticator } from './auth/token-authenticator';
import { AccountRecoveryService } from './auth-links/account-recovery.service';
import { AuthLinksController } from './auth-links/auth-links.controller';
import { AuthLinks } from './auth-links/auth-links.service';
import { AuthLinksMessageBuilder } from './auth-links/auth-links-message-builder';
import { RecoveryRateLimiter } from './auth-links/recovery-rate-limiter';
import { CandidateDirectoryService } from './candidate-directory.service';
import { CredentialSlipsController } from './credential-slips/credential-slips.controller';
import { CredentialSlipsService } from './credential-slips/credential-slips.service';
import { PdfKitSlipRenderer, SLIP_RENDERER } from './credential-slips/slip-renderer';
import { SlipVault } from './credential-slips/slip-vault';
import { ExaminerDirectoryService } from './examiner-directory.service';
import { InvitationAcceptanceService } from './invitations/invitation-acceptance.service';
import { InvitationRateLimiter } from './invitations/invitation-rate-limiter';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationsService } from './invitations/invitations.service';
import { PublicInvitationsController } from './invitations/public-invitations.controller';
import { LoginEventsController } from './login-events/login-events.controller';
import { LoginEventsService } from './login-events/login-events.service';
import { IdentityMaintenanceJob } from './maintenance/identity-maintenance.job';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { AdminsController, UserManagementController } from './users/user-management.controller';
import { UserManagementService } from './users/user-management.service';
import { UsersRepository } from './users.repository';

@Module({
  imports: [AuditModule, NotificationsModule, MailModule],
  controllers: [
    AuthController,
    AccountController,
    UserManagementController,
    AdminsController,
    UnitsController,
    LoginEventsController,
    AuditLogsController,
    InvitationsController,
    AuthLinksController,
    PublicInvitationsController,
    AccountRequestsController,
    CredentialSlipsController,
  ],
  providers: [
    AuthService,
    AccountService,
    AuthSessionStore,
    TokenAuthenticator,
    LoginRateLimiter,
    LoginBlock,
    UsersRepository,
    AdminAccountsService,
    UserManagementService,
    UnitsService,
    LoginEventsService,
    AuthLinks,
    AuthLinksMessageBuilder,
    AccountRecoveryService,
    RecoveryRateLimiter,
    InvitationsService,
    InvitationAcceptanceService,
    InvitationRateLimiter,
    AccountRequestsService,
    RequesterCredentialsService,
    CandidateDirectoryService,
    ExaminerDirectoryService,
    AdminDirectoryService,
    AccountRequestParseJob,
    AccountRequestApproveJob,
    CredentialSlipsService,
    SlipVault,
    { provide: SLIP_RENDERER, useClass: PdfKitSlipRenderer },
    IdentityMaintenanceJob,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // CLI và các module khác chỉ dùng những gì được xuất ở đây.
  exports: [
    AuthLinks,
    AuthSessionStore,
    TokenAuthenticator,
    AdminAccountsService,
    RequesterCredentialsService,
    CandidateDirectoryService,
    ExaminerDirectoryService,
    AdminDirectoryService,
  ],
})
export class IdentityModule {}
