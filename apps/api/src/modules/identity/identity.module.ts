import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthSessionStore } from './auth/auth-session-store';
import { LoginBlock } from './auth/login-block';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { UserManagementController } from './users/user-management.controller';
import { UserManagementService } from './users/user-management.service';
import { UsersRepository } from './users.repository';

@Module({
  imports: [AuditModule],
  controllers: [AuthController, UserManagementController],
  providers: [
    AuthService,
    AuthSessionStore,
    LoginRateLimiter,
    LoginBlock,
    UsersRepository,
    AdminAccountsService,
    UserManagementService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // CLI và các module khác chỉ dùng những gì được xuất ở đây.
  exports: [AuthSessionStore, AdminAccountsService],
})
export class IdentityModule {}
