import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
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
    UsersRepository,
    AdminAccountsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionStore],
})
export class IdentityModule {}
