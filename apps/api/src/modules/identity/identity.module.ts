import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { LoginBlock } from './auth/login-block';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { SessionStore } from './auth/session-store';
import { UsersRepository } from './users.repository';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionStore,
    LoginRateLimiter,
    LoginBlock,
    UsersRepository,
    AdminAccountsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // CLI và các module khác chỉ dùng những gì được xuất ở đây.
  exports: [SessionStore, AdminAccountsService],
})
export class IdentityModule {}
